/**
 * OTRUST Sign - Zero-knowledge document signing
 * 
 * Proves that EXACT document was agreed upon by EXACT people at EXACT time.
 * Document never stored - only SHA-256 hash.
 */

import crypto from 'crypto';
import { getDb } from './db.js';
import { sendEmail, sendEmailWithAttachment } from './email.js';
import { verifySignature, generateKeypair, sign as cryptoSign } from './crypto.js';
import {
  emailTemplate,
  emailButton,
  emailButtonDanger,
  emailHashBox,
  emailInfoBox,
  emailSuccessBox,
  emailWarningBox,
  emailHeading,
  emailParagraph,
  emailMuted,
  emailActionArea,
  emailDivider,
  emailDetailsBox
} from './emailTemplate.js';

// Generate secure token for signer links
function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// Generate sign request ID
function generateSignId() {
  return 'sr_' + crypto.randomBytes(12).toString('base64url');
}

// Hash for privacy (email, IP, etc)
function privacyHash(value) {
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

// Hash the entire signature package for Bitcoin anchoring
function hashSignaturePackage(pkg) {
  const canonical = JSON.stringify(pkg, Object.keys(pkg).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Create a new sign request
 */
export async function createSignRequest({ 
  documentHash, 
  title, 
  filename,
  documentUrl,
  documentFileId, // File ID for email attachment (when created via email)
  parties,
  signingOrder,
  deadline,
  creatorEmail,
  message,
  orgId
}) {
  const db = getDb();
  const signId = generateSignId();
  const now = new Date();
  
  // Check for duplicate - same hash already in active sign request
  const existingSignRequest = await db.collection('sign_requests').findOne({
    document_hash: documentHash,
    status: { $in: ['pending', 'completed'] }
  });
  
  if (existingSignRequest) {
    const statusText = existingSignRequest.status === 'completed' 
      ? 'already been signed' 
      : 'is already in a signing process. Please cancel the existing request first';
    throw new Error(`This document has ${statusText}. Sign request ID: ${existingSignRequest.id}`);
  }
  
  // Check if already timestamped
  const existingClaim = await db.collection('claims').findOne({
    hash: documentHash,
    blockchain_confirmed: true
  });
  
  if (existingClaim) {
    throw new Error(`This document is already timestamped on the blockchain.`);
  }
  
  // Validate parties
  if (!parties || parties.length === 0) {
    throw new Error('At least one party required');
  }
  
  if (parties.length > 20) {
    throw new Error('Maximum 20 parties allowed');
  }
  
  // Create party entries with unique tokens
  const partyEntries = parties.map((party, index) => ({
    email: party.email, // Stored temporarily for sending emails
    email_hash: privacyHash(party.email),
    role: party.role, // 'signer' | 'approver' | 'viewer'
    order: signingOrder === 'sequential' ? index + 1 : null,
    token: generateToken(),
    notified_at: null,
    acted_at: null,
    action: null, // 'signed' | 'approved' | 'viewed' | 'declined'
    ip_hash: null,
    user_agent_hash: null,
    requireOtrustProof: party.requireOtrustProof || false  // Sender requires proof verification
  }));
  
  // Calculate deadline (default 30 days, max 90 days)
  const maxDeadline = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  let deadlineDate = deadline 
    ? new Date(deadline) 
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  // Enforce maximum deadline of 90 days
  if (deadlineDate > maxDeadline) {
    deadlineDate = maxDeadline;
  }
  
  // Generate secure tokens for creator actions (not guessable from email)
  const cancelToken = generateToken();
  const viewToken = generateToken();
  
  const signRequest = {
    id: signId,
    document_hash: documentHash,
    title: title || 'Untitled Document',
    filename: filename || null,
    document_url: documentUrl || null, // Optional: link to document
    document_file_id: documentFileId || null, // File ID for attachment
    message: message || null, // Optional: message to parties
    creator_email: creatorEmail, // Stored for notifications
    creator_email_hash: privacyHash(creatorEmail),
    cancel_token: cancelToken, // Secure token for cancellation (sent to creator)
    view_token: viewToken, // Secure token for viewing status (sent to creator)
    parties: partyEntries,
    signing_order: signingOrder || 'parallel', // 'parallel' | 'sequential'
    status: 'pending', // 'pending' | 'completed' | 'expired' | 'cancelled'
    created_at: now,
    deadline: deadlineDate,
    completed_at: null,
    cancelled_at: null,
    cancelled_reason: null,
    package_hash: null,
    ots_proof: null,
    org_id: orgId || null
  };
  
  await db.collection('sign_requests').insertOne(signRequest);
  
  // Send initial notifications
  await sendInitialNotifications(signRequest);
  
  return {
    sign_id: signId,
    document_hash: documentHash,
    title: signRequest.title,
    cancel_token: cancelToken, // Send to creator for cancellation
    view_token: viewToken, // Send to creator for status page
    parties: partyEntries.map(p => ({
      email: p.email,
      role: p.role,
      order: p.order
    })),
    signing_order: signRequest.signing_order,
    deadline: signRequest.deadline,
    status: signRequest.status
  };
}

/**
 * Send notifications to parties based on signing order
 */
async function sendInitialNotifications(signRequest) {
  const db = getDb();
  const now = new Date();
  
  // Determine who to notify
  let partiesToNotify;
  if (signRequest.signing_order === 'parallel') {
    // Notify all signers and approvers (not viewers yet)
    partiesToNotify = signRequest.parties.filter(p => 
      p.role === 'signer' || p.role === 'approver'
    );
  } else {
    // Sequential: only notify first party
    partiesToNotify = [signRequest.parties[0]];
  }
  
  for (const party of partiesToNotify) {
    await sendSigningInvite(signRequest, party);
    
    // Update notified_at
    await db.collection('sign_requests').updateOne(
      { id: signRequest.id, 'parties.token': party.token },
      { $set: { 'parties.$.notified_at': now } }
    );
  }
}

/**
 * Send signing invitation email
 * Now with document attachment support for email-based flow
 */
async function sendSigningInvite(signRequest, party) {
  const db = getDb();
  const actionWord = party.role === 'signer' ? 'Sign' : 
                     party.role === 'approver' ? 'Approve' : 'View';
  
  // Use BASE_URL env for local testing, fallback to production
  const baseUrl = process.env.BASE_URL || 'https://www.otrust.eu';
  const signUrl = `${baseUrl}/sign/act?id=${signRequest.id}&token=${party.token}`;
  
  // Build document download URL with auth token if it's an internal file
  let documentDownloadUrl = signRequest.document_url;
  if (documentDownloadUrl && documentDownloadUrl.includes('/sign/file/sf_')) {
    // Add token and sign_id for authenticated download
    const separator = documentDownloadUrl.includes('?') ? '&' : '?';
    documentDownloadUrl = `${baseUrl}${documentDownloadUrl}${separator}token=${party.token}&sign_id=${signRequest.id}`;
  }
  
  // Get document attachment if available
  let attachment = null;
  if (signRequest.document_file_id) {
    const file = await db.collection('sign_files').findOne({ file_id: signRequest.document_file_id });
    if (file && file.data) {
      attachment = {
        filename: file.filename || 'document',
        content: file.data // Buffer
      };
      console.log(`[SignInvite] Attaching document: ${attachment.filename} (${file.size} bytes)`);
    }
  }
  
  // Direct action links (one-click sign/decline)
  const quickSignUrl = `${baseUrl}/sign/quick?action=sign&id=${signRequest.id}&token=${party.token}`;
  const quickDeclineUrl = `${baseUrl}/sign/quick?action=decline&id=${signRequest.id}&token=${party.token}`;
  
  const canEmailSign = party.role !== 'viewer';
  
  const subject = `${actionWord}: ${signRequest.title}`;
  
  const hasAttachment = !!attachment;
  
  const text = `Hi,

You have been invited to ${actionWord.toLowerCase()} the document "${signRequest.title}".

${hasAttachment ? 'Document attached to this email.\n' : documentDownloadUrl ? `Download document: ${documentDownloadUrl}\n` : 'The document will be sent separately by the sender.\n'}
${signRequest.message ? `Message from sender:\n"${signRequest.message}"\n` : ''}
DOCUMENT FINGERPRINT (SHA-256):
${signRequest.document_hash}

IMPORTANT: Verify that your document has the same hash before signing!
You can calculate the hash at ${baseUrl} or with "sha256sum" in the terminal.

${canEmailSign ? `SIGN: ${quickSignUrl}
DECLINE: ${quickDeclineUrl}
` : `VIEW: ${signUrl}`}
Deadline: ${signRequest.deadline.toLocaleDateString('en-US')}

---
OTRUST Signed - Zero-knowledge document signing
${baseUrl}/sign`;

  // Build HTML content using template components
  let contentHtml = emailHeading(`${actionWord}: ${signRequest.title}`);
  contentHtml += emailParagraph(`You have been invited to <strong>${actionWord.toLowerCase()}</strong> the document "${signRequest.title}".`);
  
  // Document info - attachment or download (FIRST - most important)
  if (hasAttachment) {
    contentHtml += emailSuccessBox(`<strong>Document attached to this email</strong><br><span style="font-size:13px;">${attachment.filename}</span>`);
  } else if (documentDownloadUrl) {
    contentHtml += emailInfoBox(`<strong>Download document:</strong><br><a href="${documentDownloadUrl}" style="color:#16160f;text-decoration:underline;">Download</a>`);
  } else {
    contentHtml += emailWarningBox(`<strong>The document will be sent separately by the sender.</strong><br><span style="font-size:13px;">Contact the sender if you haven't received the document.</span>`);
  }
  
  // Message from sender
  if (signRequest.message) {
    contentHtml += emailInfoBox(`<strong>Message from sender:</strong><br>"${signRequest.message}"`);
  }
  
  // Document hash (collapsed/smaller)
  contentHtml += emailHashBox(signRequest.document_hash, 'Document Fingerprint (SHA-256)');
  
  // One-click action buttons for signers/approvers
  if (canEmailSign) {
    contentHtml += emailActionArea(`
      ${emailButton(actionWord, quickSignUrl)}
      &nbsp;&nbsp;
      ${emailButtonDanger('Decline', quickDeclineUrl)}
    `);
  } else {
    // Viewer just gets a view button
    contentHtml += emailActionArea(emailButton(`View Document`, signUrl));
  }
  
  // Deadline
  contentHtml += emailMuted(`<strong>Deadline:</strong> ${signRequest.deadline.toLocaleDateString('en-US')}`);
  
  // Safety warning and abuse reporting
  const abuseUrl = `${baseUrl}/report-abuse?ref=${signRequest.id}`;
  contentHtml += emailWarningBox(`
    <strong>Safety notice:</strong> Only sign documents from people you know and trust.
    Never sign documents under pressure or without reading them carefully.
    <br><br>
    <a href="${abuseUrl}" style="color:#8a6a25;text-decoration:underline;">Report suspicious activity</a>
  `);
  
  const html = emailTemplate({
    title: subject,
    preheader: `You have been invited to ${actionWord.toLowerCase()} "${signRequest.title}"`,
    content: contentHtml,
    product: 'Signed'
  });

  try {
    // Send with attachment if available, otherwise plain email
    if (attachment) {
      await sendEmailWithAttachment(
        party.email, 
        subject, 
        html, 
        text, 
        attachment,
        'OTRUST Signed <sign@otrust.eu>'
      );
      console.log(`Sign invite with attachment sent to ${party.email} for ${signRequest.id}`);
    } else {
      await sendEmail(party.email, subject, html, text);
      console.log(`Sign invite sent to ${party.email} for ${signRequest.id}`);
    }
  } catch (err) {
    console.error(`Failed to send sign invite to ${party.email}:`, err.message);
  }
}

/**
 * Get sign request by ID (for creator/status page)
 * Requires view_token for security (prevents enumeration)
 */
export async function getSignRequest(signId, viewToken = null) {
  const db = getDb();
  const signRequest = await db.collection('sign_requests').findOne({ id: signId });
  
  if (!signRequest) return null;
  
  // If viewToken provided, verify it (for full status view)
  const isAuthenticated = viewToken && timingSafeEqual(signRequest.view_token, viewToken);
  
  // Without token, return ONLY minimal info - no metadata leak
  if (!isAuthenticated) {
    return {
      id: signRequest.id,
      status: signRequest.status,
      is_authenticated: false,
      // Tell them they need to authenticate for more info
      requires_token: true
    };
  }
  
  // Mask email hints more aggressively
  const maskEmail = (email) => {
    if (!email) return null;
    const [local, domain] = email.split('@');
    const domainParts = domain.split('.');
    // Only show first char of local and TLD
    return `${local.charAt(0)}***@***.${domainParts[domainParts.length - 1]}`;
  };
  
  // Get file expiry info if document is hosted by us
  let fileExpiresAt = null;
  let fileTtlHours = null;
  if (signRequest.document_url && signRequest.document_url.includes('/sign/file/sf_')) {
    const fileIdMatch = signRequest.document_url.match(/sf_[a-zA-Z0-9_-]+/);
    if (fileIdMatch) {
      const file = await db.collection('sign_files').findOne({ file_id: fileIdMatch[0] });
      if (file) {
        fileExpiresAt = file.expires_at;
        fileTtlHours = file.ttl_hours;
      }
    }
  }
  
  return {
    id: signRequest.id,
    document_hash: signRequest.document_hash,
    title: signRequest.title,
    filename: signRequest.filename,
    document_url: signRequest.document_url,
    signing_order: signRequest.signing_order,
    status: signRequest.status,
    created_at: signRequest.created_at,
    deadline: signRequest.deadline,
    completed_at: signRequest.completed_at,
    cancelled_at: signRequest.cancelled_at,
    parties: signRequest.parties.map(p => ({
      email_hint: maskEmail(p.email),
      role: p.role,
      order: p.order,
      notified_at: p.notified_at,
      acted_at: p.acted_at,
      action: p.action
    })),
    total_parties: signRequest.parties.length,
    completed_count: signRequest.parties.filter(p => p.acted_at && p.action !== 'declined').length,
    has_proof: !!signRequest.blockchain_confirmed,
    blockchain_block: signRequest.blockchain_block || null,
    blockchain_confirmed_at: signRequest.blockchain_confirmed_at || null,
    is_authenticated: true,
    // File expiry info (for countdown timer)
    file_expires_at: fileExpiresAt,
    file_ttl_hours: fileTtlHours
  };
}

// Timing-safe string comparison to prevent timing attacks
function timingSafeEqual(a, b) {
  // Security: Ensure both inputs are strings to prevent type confusion
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Get sign request by token (for signing page)
 */
export async function getSignRequestByToken(signId, token) {
  const db = getDb();
  const signRequest = await db.collection('sign_requests').findOne({ 
    id: signId,
    'parties.token': token 
  });
  
  if (!signRequest) return null;
  
  const party = signRequest.parties.find(p => p.token === token);
  if (!party) return null;
  
  // Check if it's this party's turn (for sequential signing)
  let isMyTurn = true;
  if (signRequest.signing_order === 'sequential' && party.order > 1) {
    const previousParties = signRequest.parties.filter(p => p.order < party.order);
    isMyTurn = previousParties.every(p => p.acted_at && p.action !== 'declined');
  }
  
  // Create masked email hint (e.g., "jo***@example.com")
  let creatorEmailHint = null;
  if (signRequest.creator_email) {
    const [local, domain] = signRequest.creator_email.split('@');
    if (local.length <= 2) {
      creatorEmailHint = `${local}***@${domain}`;
    } else {
      creatorEmailHint = `${local.slice(0, 2)}***@${domain}`;
    }
  }
  
  // Check if document is hosted by us and verify hash automatically
  let fileVerified = false;
  let fileVerifiedAt = null;
  let fileExpiresAt = null;
  let fileTtlHours = null;
  
  if (signRequest.document_url && signRequest.document_url.includes('/sign/file/sf_')) {
    // Extract file ID from URL
    const fileIdMatch = signRequest.document_url.match(/sf_[a-zA-Z0-9_-]+/);
    if (fileIdMatch) {
      const fileId = fileIdMatch[0];
      const file = await db.collection('sign_files').findOne({ file_id: fileId });
      
      if (file) {
        if (file.hash === signRequest.document_hash) {
          fileVerified = true;
          fileVerifiedAt = new Date();
        }
        fileExpiresAt = file.expires_at;
        fileTtlHours = file.ttl_hours;
      }
    }
  }
  
  return {
    id: signRequest.id,
    document_hash: signRequest.document_hash,
    title: signRequest.title,
    filename: signRequest.filename,
    document_url: signRequest.document_url,
    message: signRequest.message,
    creator_email_hint: creatorEmailHint,
    signing_order: signRequest.signing_order,
    status: signRequest.status,
    deadline: signRequest.deadline,
    my_role: party.role,
    my_order: party.order,
    already_acted: !!party.acted_at,
    my_action: party.action,
    is_my_turn: isMyTurn,
    total_parties: signRequest.parties.length,
    completed_count: signRequest.parties.filter(p => p.acted_at && p.action !== 'declined').length,
    // OTRUST Proof requirement (set by sender)
    requireOtrustProof: party.requireOtrustProof || false,
    // Auto-verification: if true, user can sign directly without manual verification
    file_verified: fileVerified,
    file_verified_at: fileVerifiedAt,
    // File expiry info (for countdown timer)
    file_expires_at: fileExpiresAt,
    file_ttl_hours: fileTtlHours
  };
}

/**
 * Verify document hash matches
 */
export async function verifyDocumentHash(signId, token, providedHash) {
  const signRequest = await getSignRequestByToken(signId, token);
  
  if (!signRequest) {
    return { valid: false, error: 'Invalid sign request or token' };
  }
  
  if (signRequest.status !== 'pending') {
    return { valid: false, error: `Sign request is ${signRequest.status}` };
  }
  
  if (new Date() > new Date(signRequest.deadline)) {
    return { valid: false, error: 'Sign request has expired' };
  }
  
  const matches = providedHash === signRequest.document_hash;
  
  return {
    valid: matches,
    error: matches ? null : 'Document hash does not match. Please ensure you have the correct document.',
    document_hash: signRequest.document_hash
  };
}

/**
 * Complete a signature/approval
 */
export async function completeSignature({ signId, token, documentHash, action, signature, pubkey, ip, userAgent, otrustProof }) {
  const db = getDb();
  const now = new Date();
  
  // Get the sign request
  const signRequest = await db.collection('sign_requests').findOne({ 
    id: signId,
    'parties.token': token 
  });
  
  if (!signRequest) {
    throw new Error('Invalid sign request or token');
  }
  
  if (signRequest.status !== 'pending') {
    throw new Error(`Sign request is ${signRequest.status}`);
  }
  
  if (new Date() > signRequest.deadline) {
    throw new Error('Sign request has expired');
  }
  
  // Verify document hash
  if (documentHash !== signRequest.document_hash) {
    throw new Error('Document hash does not match');
  }
  
  const party = signRequest.parties.find(p => p.token === token);
  
  if (party.acted_at) {
    throw new Error('You have already acted on this document');
  }
  
  // Check if it's this party's turn (sequential)
  if (signRequest.signing_order === 'sequential' && party.order > 1) {
    const previousParties = signRequest.parties.filter(p => p.order < party.order);
    const allPreviousDone = previousParties.every(p => p.acted_at && p.action !== 'declined');
    if (!allPreviousDone) {
      throw new Error('Waiting for previous parties to act');
    }
  }
  
  // Validate action based on role
  const validActions = {
    'signer': ['signed', 'declined'],
    'approver': ['approved', 'declined'],
    'viewer': ['viewed']
  };
  
  if (!validActions[party.role]?.includes(action)) {
    throw new Error(`Invalid action "${action}" for role "${party.role}"`);
  }
  
  // Check if OTRUST Proof is required for this party (set by sender)
  if (party.requireOtrustProof && action !== 'declined') {
    if (!otrustProof || !otrustProof.valid || !otrustProof.proofId) {
      throw new Error('OTRUST Proof verification is required by the sender. Please verify with your Proof ID and PIN.');
    }
  }
  
  // Verify cryptographic signature for signers and approvers
  if ((action === 'signed' || action === 'approved') && signature && pubkey) {
    const validSig = await verifySignature(documentHash, signature, pubkey);
    if (!validSig) {
      throw new Error('Invalid cryptographic signature');
    }
  } else if (action === 'signed' || action === 'approved') {
    // Require cryptographic signature for signers/approvers
    throw new Error('Cryptographic signature required for signing/approving');
  }
  
  // Prepare OTRUST Proof data if provided (sanitize - only include safe fields)
  let otrustProofData = null;
  if (otrustProof && otrustProof.valid && otrustProof.proofId) {
    otrustProofData = {
      proofId: otrustProof.proofId,
      verifiedAt: otrustProof.verifiedAt,
      verification: otrustProof.verification || {},
      statement: 'Unique verified human identity'
    };
  }
  
  // Update the party's status with cryptographic proof
  await db.collection('sign_requests').updateOne(
    { id: signId, 'parties.token': token },
    { 
      $set: { 
        'parties.$.acted_at': now,
        'parties.$.action': action,
        'parties.$.signature': signature || null,
        'parties.$.pubkey': pubkey || null,
        'parties.$.ip_hash': ip ? privacyHash(ip) : null,
        'parties.$.user_agent_hash': userAgent ? privacyHash(userAgent) : null,
        'parties.$.otrustProof': otrustProofData  // Optional: verified OTRUST Proof
      } 
    }
  );
  
  // Notify creator of the action (signed, approved, declined)
  await notifyCreatorOfAction(signRequest, party, action);
  
  // Check if all required parties have acted
  const updatedRequest = await db.collection('sign_requests').findOne({ id: signId });
  const requiredParties = updatedRequest.parties.filter(p => p.role !== 'viewer');
  const allDone = requiredParties.every(p => p.acted_at);
  const anyDeclined = requiredParties.some(p => p.action === 'declined');
  
  if (allDone && !anyDeclined) {
    // All parties signed/approved - complete the sign request
    await completeSignRequest(signId);
  } else if (allDone && anyDeclined) {
    // All parties have acted but someone declined - mark as declined
    await db.collection('sign_requests').updateOne(
      { id: signId },
      { $set: { status: 'declined', declined_at: now } }
    );
    // Notify creator that document was declined
    await notifyDeclined(updatedRequest);
  } else if (signRequest.signing_order === 'sequential' && !anyDeclined) {
    // Notify next party in sequence
    const nextParty = updatedRequest.parties.find(p => !p.acted_at && p.role !== 'viewer');
    if (nextParty) {
      await sendSigningInvite(updatedRequest, nextParty);
      await db.collection('sign_requests').updateOne(
        { id: signId, 'parties.token': nextParty.token },
        { $set: { 'parties.$.notified_at': now } }
      );
    }
  } else if (anyDeclined && signRequest.signing_order === 'sequential') {
    // Sequential: if someone declined, stop the flow and mark as declined
    await db.collection('sign_requests').updateOne(
      { id: signId },
      { $set: { status: 'declined', declined_at: now } }
    );
    await notifyDeclined(updatedRequest);
  }
  
  return {
    success: true,
    action,
    sign_id: signId,
    completed: allDone && !anyDeclined,
    declined: anyDeclined
  };
}

/**
 * Complete the sign request and create proof package
 */
async function completeSignRequest(signId) {
  const db = getDb();
  const now = new Date();
  
  const signRequest = await db.collection('sign_requests').findOne({ id: signId });
  
  // Build the signature package (for Bitcoin anchoring)
  const signaturePackage = {
    version: 2, // Upgraded to include cryptographic signatures
    sign_request_id: signRequest.id,
    document: {
      hash: signRequest.document_hash,
      title: signRequest.title,
      filename: signRequest.filename
    },
    parties: signRequest.parties.map(p => ({
      email_hash: p.email_hash,
      role: p.role,
      action: p.action,
      acted_at: p.acted_at?.toISOString(),
      // Cryptographic proof (for signers/approvers)
      signature: p.signature || null,
      pubkey: p.pubkey || null,
      verification: {
        document_hash_matched: true,
        unique_token_used: true,
        cryptographic_signature_verified: !!(p.signature && p.pubkey)
      }
    })),
    created_at: signRequest.created_at.toISOString(),
    completed_at: now.toISOString()
  };
  
  const packageHash = hashSignaturePackage(signaturePackage);
  
  // Update sign request
  await db.collection('sign_requests').updateOne(
    { id: signId },
    { 
      $set: { 
        status: 'completed',
        completed_at: now,
        package_hash: packageHash,
        signature_package: signaturePackage,
        // Mark for OTS processing (like claims)
        ots_pending: true
      } 
    }
  );
  
  // Notify all parties (initial completion email - before blockchain)
  await notifyCompletion(signRequest);
  
  console.log(`Sign request ${signId} completed with package hash ${packageHash} - awaiting blockchain confirmation`);
}

/**
 * Notify creator when a party takes action (sign, approve, decline)
 */
async function notifyCreatorOfAction(signRequest, party, action) {
  const BASE_URL = process.env.BASE_URL || 'https://www.otrust.eu';
  const statusUrl = `${BASE_URL}/sign/${signRequest.id}?token=${signRequest.view_token}`;
  
  let emoji, actionText, statusColor, statusMessage;
  
  switch (action) {
    case 'signed':
      emoji = '';
      actionText = 'signed';
      statusColor = '#059669';
      statusMessage = 'A party has signed the document.';
      break;
    case 'approved':
      emoji = '';
      actionText = 'approved';
      statusColor = '#059669';
      statusMessage = 'A party has approved the document.';
      break;
    case 'declined':
      emoji = '';
      actionText = 'declined';
      statusColor = '#dc2626';
      statusMessage = 'A party has declined to sign the document. The signing request has been cancelled.';
      break;
    default:
      return; // Don't notify for unknown actions
  }
  
  const subject = `${emoji} ${signRequest.title} - ${actionText}`;
  
  // Mask email for privacy (show first letter and domain)
  const maskedEmail = party.email.replace(/^(.).*@/, '$1***@');
  
  const text = `${maskedEmail} (${party.role}) has ${actionText} the document "${signRequest.title}".

${statusMessage}

Track Progress: ${statusUrl}

---
OTRUST Signed - Zero-knowledge document signing`;
  
  // Build HTML content using template components
  let contentHtml = emailHeading(`Document ${actionText}`, 2);
  contentHtml += emailParagraph(`<strong>${maskedEmail}</strong> (${party.role}) has ${actionText} the document:`);
  contentHtml += emailInfoBox(`<strong>${signRequest.title}</strong>`, '');
  contentHtml += emailMuted(statusMessage);
  contentHtml += emailActionArea(emailButton('Track Progress', statusUrl));
  
  const html = emailTemplate({
    title: subject,
    preheader: `${maskedEmail} has ${actionText} "${signRequest.title}"`,
    content: contentHtml,
    product: 'Signed'
  });

  try {
    await sendEmail(signRequest.creator_email, subject, html, text);
    console.log(`Notified creator of ${action} action on ${signRequest.id}`);
  } catch (err) {
    console.error('Failed to send action notification:', err.message);
  }
}

/**
 * Notify all parties when signing is complete
 */
async function notifyCompletion(signRequest) {
  const BASE_URL = process.env.BASE_URL || 'https://www.otrust.eu';
  const subject = `Completed: ${signRequest.title}`;
  const proofUrl = `${BASE_URL}/sign/${signRequest.id}?token=${signRequest.view_token}`;
  
  // Build party list for email
  const partyList = signRequest.parties.map(p => {
    const maskedEmail = p.email.replace(/^(.).*@/, '$1***@');
    const actionEmoji = '';
    return `${maskedEmail} (${p.role}) - ${p.action}`;
  }).join('\n');
  
  const text = `The document "${signRequest.title}" has been signed by all parties.

AWAITING BLOCKCHAIN CONFIRMATION
The signature package is being anchored to the Bitcoin blockchain.
You'll receive another email when the proof is ready (typically a few hours).

Document Hash (SHA-256):
${signRequest.document_hash}

Signatures:
${partyList}

Track Progress:
${proofUrl}

---
OTRUST Signed - Zero-knowledge document signing
${BASE_URL}/sign`;

  // Build HTML party list
  const partyListHtml = signRequest.parties.map(p => {
    const maskedEmail = p.email.replace(/^(.).*@/, '$1***@');
    const actionEmoji = '';
    const actionColor = p.action === 'signed' ? '#059669' : p.action === 'approved' ? '#2563eb' : '#6b7280';
    return `<div style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
      <strong>${maskedEmail}</strong>
      <span style="color: #666;">(${p.role})</span>
      <span style="color: ${actionColor}; float: right;">${p.action}</span>
    </div>`;
  }).join('');

  // Build HTML content using template components
  let contentHtml = emailHeading(`Completed: ${signRequest.title}`);
  contentHtml += emailParagraph('The document has been signed/approved by all parties.');
  contentHtml += emailWarningBox(`<strong>Awaiting Blockchain Confirmation</strong><p style="margin:8px 0 0 0;font-size:14px;">The signature package is being anchored to the Bitcoin blockchain. You'll receive another email when the proof is ready (typically a few hours).</p>`, '');
  contentHtml += emailHashBox(signRequest.document_hash, 'Document Hash (SHA-256)');
  contentHtml += emailInfoBox(`<strong>Signatures:</strong><div style="margin-top:10px;font-size:14px;">${partyListHtml}</div>`, '');
  contentHtml += emailActionArea(emailButton('Track Progress', proofUrl));
  
  const html = emailTemplate({
    title: subject,
    preheader: `All parties have signed "${signRequest.title}"`,
    content: contentHtml,
    product: 'Signed'
  });

  // Notify creator
  try {
    await sendEmail(signRequest.creator_email, subject, html, text);
  } catch (err) {
    console.error('Failed to send completion notification to creator:', err.message);
  }
  
  // Notify all parties
  for (const party of signRequest.parties) {
    if (party.email && party.email !== signRequest.creator_email) {
      try {
        await sendEmail(party.email, subject, html, text);
      } catch (err) {
        console.error(`Failed to send completion notification to ${party.email}:`, err.message);
      }
    }
  }
}

/**
 * Notify creator that sign request was declined
 */
async function notifyDeclined(signRequest) {
  const BASE_URL = process.env.BASE_URL || 'https://www.otrust.eu';
  const statusUrl = `${BASE_URL}/sign/${signRequest.id}?token=${signRequest.view_token}`;
  
  // Find who declined
  const declinedParties = signRequest.parties.filter(p => p.action === 'declined');
  const declinedList = declinedParties.map(p => {
    const maskedEmail = p.email.replace(/^(.).*@/, '$1***@');
    return `${maskedEmail} (${p.role})`;
  }).join(', ');
  
  const subject = `Declined: ${signRequest.title}`;
  
  const text = `The signing process for "${signRequest.title}" has been stopped.

Declined by: ${declinedList}

You may need to contact the parties to discuss concerns and potentially create a new signing request.

View details: ${statusUrl}

---
OTRUST Signed - Zero-knowledge document signing`;
  
  // Build HTML content using template components
  let contentHtml = emailHeading('Document Declined');
  contentHtml += emailParagraph('The signing process for the following document has been stopped because one or more parties declined:');
  contentHtml += emailInfoBox(`<strong>${signRequest.title}</strong>`, '');
  contentHtml += emailParagraph(`<strong>Declined by:</strong> ${declinedList}`);
  contentHtml += emailMuted('You may need to contact the parties to discuss concerns and potentially create a new signing request.');
  contentHtml += emailActionArea(emailButton('View Details', statusUrl));
  
  const html = emailTemplate({
    title: subject,
    preheader: `"${signRequest.title}" was declined`,
    content: contentHtml,
    product: 'Signed'
  });

  try {
    await sendEmail(signRequest.creator_email, subject, html, text);
    console.log(`Notified creator that ${signRequest.id} was declined`);
  } catch (err) {
    console.error('Failed to send decline notification:', err.message);
  }
}

/**
 * Cancel a sign request (creator only)
 * Uses cancel_token for security (not email hash which can be brute-forced)
 */
export async function cancelSignRequest(signId, cancelToken, reason) {
  const db = getDb();
  const now = new Date();
  
  const signRequest = await db.collection('sign_requests').findOne({ id: signId });
  
  if (!signRequest) {
    throw new Error('Sign request not found');
  }
  
  // Use timing-safe comparison to prevent timing attacks
  if (!signRequest.cancel_token || !timingSafeEqual(signRequest.cancel_token, cancelToken)) {
    throw new Error('Invalid cancellation token');
  }
  
  if (signRequest.status !== 'pending') {
    throw new Error(`Cannot cancel: sign request is ${signRequest.status}`);
  }
  
  // Sanitize reason to prevent XSS (escape HTML entities)
  const sanitizeHtml = (str) => {
    if (!str) return null;
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };
  
  const safeReason = reason ? sanitizeHtml(reason.substring(0, 500)) : null;
  
  await db.collection('sign_requests').updateOne(
    { id: signId },
    { 
      $set: { 
        status: 'cancelled',
        cancelled_at: now,
        cancelled_reason: safeReason
      } 
    }
  );
  
  // Notify all parties
  const BASE_URL = process.env.BASE_URL || 'https://www.otrust.eu';
  const subject = `Cancelled: ${signRequest.title}`;
  
  const text = `The signing request for "${signRequest.title}" has been cancelled by the sender.

${safeReason ? `Reason: ${safeReason}` : ''}

---
OTRUST Signed - Zero-knowledge document signing
${BASE_URL}/sign`;

  // Build HTML content using template components
  let contentHtml = emailHeading('Signing Request Cancelled');
  contentHtml += emailParagraph('The signing request for the following document has been cancelled by the sender:');
  contentHtml += emailInfoBox(`<strong>${signRequest.title}</strong>`, '');
  if (safeReason) {
    contentHtml += emailParagraph(`<strong>Reason:</strong> ${safeReason}`);
  }
  contentHtml += emailMuted('No further action is required from you.');
  
  const html = emailTemplate({
    title: subject,
    preheader: `"${signRequest.title}" has been cancelled`,
    content: contentHtml,
    product: 'Signed'
  });

  for (const party of signRequest.parties) {
    if (party.email && party.notified_at) {
      try {
        await sendEmail(party.email, subject, html, text);
      } catch (err) {
        console.error(`Failed to send cancellation to ${party.email}:`, err.message);
      }
    }
  }
  
  return { success: true, sign_id: signId, status: 'cancelled' };
}

/**
 * Send reminder to parties who haven't acted
 * Uses cancel_token for authentication (same as cancel since it's a creator action)
 */
export async function sendReminder(signId, token) {
  const db = getDb();
  
  const signRequest = await db.collection('sign_requests').findOne({ id: signId });
  
  if (!signRequest) {
    throw new Error('Sign request not found');
  }
  
  // Accept either cancel_token or view_token (both are creator tokens)
  const validCancelToken = signRequest.cancel_token && timingSafeEqual(signRequest.cancel_token, token);
  const validViewToken = signRequest.view_token && timingSafeEqual(signRequest.view_token, token);
  
  if (!validCancelToken && !validViewToken) {
    throw new Error('Invalid token');
  }
  
  if (signRequest.status !== 'pending') {
    throw new Error(`Cannot remind: sign request is ${signRequest.status}`);
  }
  
  // Find parties who haven't acted and should be notified
  const partiesToRemind = signRequest.parties.filter(p => {
    if (p.acted_at) return false;
    if (p.role === 'viewer') return false;
    
    // For sequential, only remind if it's their turn
    if (signRequest.signing_order === 'sequential') {
      const previousParties = signRequest.parties.filter(pp => pp.order < p.order);
      return previousParties.every(pp => pp.acted_at && pp.action !== 'declined');
    }
    
    return true;
  });
  
  let sentCount = 0;
  for (const party of partiesToRemind) {
    // Create reminder with prefixed message
    const reminderMessage = signRequest.message 
      ? `REMINDER: ${signRequest.message}` 
      : 'REMINDER: Please sign this document at your earliest convenience.';
    await sendSigningInvite({ ...signRequest, message: reminderMessage }, party);
    sentCount++;
  }
  
  return { success: true, reminders_sent: sentCount };
}

/**
 * Get signature package/proof
 */
export async function getSignaturePackage(signId) {
  const db = getDb();
  const signRequest = await db.collection('sign_requests').findOne({ id: signId });
  
  if (!signRequest) {
    return null;
  }
  
  if (signRequest.status !== 'completed') {
    return null;
  }
  
  return {
    ...signRequest.signature_package,
    package_hash: signRequest.package_hash,
    ots_proof: signRequest.ots_proof
  };
}

/**
 * Process mailto-based signing (from email link click)
 * Subject format: SIGN:signId:token or DECLINE:signId:token
 * Can also be called from quick-sign endpoint (token is the auth)
 */
export async function processMailtoSign({ signId, token, fromEmail, action, ip }) {
  const db = getDb();
  
  console.log(`[MailtoSign] Processing ${action} for ${signId}`);
  
  // Find the sign request
  const signRequest = await db.collection('sign_requests').findOne({ id: signId });
  
  if (!signRequest) {
    return { success: false, error: 'Sign request not found' };
  }
  
  if (signRequest.status !== 'pending') {
    return { success: false, error: `Sign request is ${signRequest.status}, not pending` };
  }
  
  // Find the party by token (token IS the authentication)
  const party = signRequest.parties.find(p => p.token === token);
  
  if (!party) {
    return { success: false, error: 'Invalid token' };
  }
  
  // If fromEmail provided, verify it matches (for extra security from email flow)
  // But token alone is sufficient auth for quick-sign links
  if (fromEmail && party.email.toLowerCase() !== fromEmail.toLowerCase()) {
    console.log(`[MailtoSign] Email mismatch: ${fromEmail} vs ${party.email}`);
    return { success: false, error: 'Email does not match the invited party' };
  }
  
  if (party.acted_at) {
    return { success: false, error: 'You have already responded to this request' };
  }
  
  // Check deadline
  if (new Date() > signRequest.deadline) {
    return { success: false, error: 'Sign request has expired' };
  }
  
  // Check sequential order for signers
  if (signRequest.signing_order === 'sequential' && party.order > 1) {
    const previousParties = signRequest.parties.filter(p => p.order < party.order);
    const allPreviousDone = previousParties.every(p => p.acted_at && p.action !== 'declined');
    if (!allPreviousDone) {
      return { success: false, error: 'Waiting for previous parties to sign first' };
    }
  }
  
  if (action === 'decline') {
    // Process decline
    const result = await completeSignature({
      signId,
      token,
      documentHash: signRequest.document_hash,
      action: 'declined',
      signature: null,
      pubkey: null,
      ip,
      userAgent: 'MailtoSign/1.0'
    });
    
    return {
      success: true,
      action: 'declined',
      sign_id: signId,
      title: signRequest.title,
      message: 'You have declined to sign this document'
    };
  }
  
  // Process sign - generate keypair server-side
  const keypair = await generateKeypair('ed25519');
  const signature = await cryptoSign(signRequest.document_hash, keypair.privateKey);
  
  const signAction = party.role === 'signer' ? 'signed' : 'approved';
  
  const result = await completeSignature({
    signId,
    token,
    documentHash: signRequest.document_hash,
    action: signAction,
    signature,
    pubkey: keypair.publicKey,
    ip,
    userAgent: 'MailtoSign/1.0'
  });
  
  console.log(`[MailtoSign] Successfully ${signAction} for ${fromEmail} on ${signId}`);
  
  return {
    success: true,
    action: signAction,
    sign_id: signId,
    title: signRequest.title,
    message: `Document ${signAction} successfully via email`
  };
}

/**
 * Process email-based signing
 * Called when a party replies to a signing invite with the document attached
 * The document hash is calculated and matched against pending sign requests
 */
export async function processEmailSign({ fromEmail, documentHash, ip }) {
  const db = getDb();
  
  if (!documentHash || !/^[a-f0-9]{64}$/i.test(documentHash)) {
    console.log(`[EmailSign] Invalid document hash: "${documentHash}"`);
    return { success: false, error: 'No valid document attached or hash could not be calculated' };
  }
  
  const normalizedHash = documentHash.toLowerCase();
  console.log(`[EmailSign] Processing hash: ${normalizedHash} from ${fromEmail}`);
  
  // Find pending sign request with this document hash where sender is a party
  const signRequest = await db.collection('sign_requests').findOne({
    document_hash: normalizedHash,
    status: 'pending',
    'parties.email': { $regex: new RegExp(`^${fromEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
  });
  
  if (!signRequest) {
    console.log(`[EmailSign] No pending sign request found for hash: ${normalizedHash} and email: ${fromEmail}`);
    return { success: false, error: 'No pending signature request found for this document and email' };
  }
  
  // Find the party
  const party = signRequest.parties.find(p => 
    p.email.toLowerCase() === fromEmail.toLowerCase() &&
    (p.role === 'signer' || p.role === 'approver')
  );
  
  if (!party) {
    console.log(`[EmailSign] Email ${fromEmail} is not a signer/approver`);
    return { success: false, error: 'You are not listed as a signer for this document' };
  }
  
  if (party.acted_at) {
    return { success: false, error: 'You have already signed this document' };
  }
  
  // Check deadline
  if (new Date() > signRequest.deadline) {
    return { success: false, error: 'Sign request has expired' };
  }
  
  // Check sequential order
  if (signRequest.signing_order === 'sequential' && party.order > 1) {
    const previousParties = signRequest.parties.filter(p => p.order < party.order);
    const allPreviousDone = previousParties.every(p => p.acted_at && p.action !== 'declined');
    if (!allPreviousDone) {
      return { success: false, error: 'Waiting for previous parties to sign first' };
    }
  }
  
  // Generate keypair for this email signer (server-side generation)
  // Note: This is less zero-knowledge than browser signing, but enables inbox UX
  const keypair = await generateKeypair('ed25519');
  
  // Sign the document hash
  const signature = await cryptoSign(signRequest.document_hash, keypair.privateKey);
  
  // Determine action based on role
  const action = party.role === 'signer' ? 'signed' : 'approved';
  
  // Complete the signature using the standard flow
  const result = await completeSignature({
    signId: signRequest.id,
    token: party.token,
    documentHash: signRequest.document_hash,
    action,
    signature,
    pubkey: keypair.publicKey,
    ip: ip || null,
    userAgent: 'EmailSign/1.0'
  });
  
  console.log(`[EmailSign] Successfully processed ${action} for ${fromEmail} on ${signRequest.id}`);
  
  return {
    success: true,
    action,
    sign_id: signRequest.id,
    title: signRequest.title,
    message: `Document ${action} successfully via email`
  };
}

/**
 * Create sign request from email
 * User sends email to sign@otrust.eu with signers in TO/CC and document attached
 */
export async function createSignRequestFromEmail({ 
  fromEmail, 
  signers,      // New: direct signers array
  toEmails,     // Legacy: TO list
  ccEmails,     // Legacy: CC list
  subject, 
  body,
  documentHash, 
  filename,
  documentData,  // Base64 encoded document from email
  documentType,  // MIME type
  ip 
}) {
  const db = getDb();
  
  // Use signers array if provided, otherwise combine TO and CC (legacy)
  let signEmails;
  if (signers && Array.isArray(signers) && signers.length > 0) {
    signEmails = signers.map(e => e.toLowerCase().trim());
  } else {
    // Legacy: Combine TO and CC as signers (excluding the sign@ address)
    signEmails = [...(toEmails || []), ...(ccEmails || [])]
      .map(e => e.toLowerCase().trim())
      .filter(e => !e.includes('sign@'));
  }
  
  // Dedupe signers
  const uniqueSigners = [...new Set(signEmails)];
  
  // Check if sender wants to sign too (if body mentions it)
  const senderSigns = body?.toLowerCase().includes('jag signerar') || 
                      body?.toLowerCase().includes('i sign') ||
                      body?.toLowerCase().includes('+me');
  
  if (uniqueSigners.length === 0 && !senderSigns) {
    return { 
      success: false, 
      error: 'No signers found. Send to signers with sign@otrust.eu in CC.' 
    };
  }
  
  if (!documentHash) {
    return { 
      success: false, 
      error: 'No document attached. Please attach the document to sign.' 
    };
  }
  
  // Check for duplicate - same hash already in active sign request
  const existingSignRequest = await db.collection('sign_requests').findOne({
    document_hash: documentHash,
    status: { $in: ['pending', 'completed'] }
  });
  
  if (existingSignRequest) {
    const statusText = existingSignRequest.status === 'completed' 
      ? 'already been signed' 
      : 'is already in a signing process. Please cancel the existing request first';
    return {
      success: false,
      error: `This document has ${statusText}. Sign request ID: ${existingSignRequest.id}`,
      existing_id: existingSignRequest.id,
      existing_status: existingSignRequest.status
    };
  }
  
  // Check if already timestamped
  const existingClaim = await db.collection('claims').findOne({
    hash: documentHash,
    blockchain_confirmed: true
  });
  
  if (existingClaim) {
    return {
      success: false,
      error: `This document is already timestamped on the blockchain (${existingClaim.blockchain_confirmed_at?.toISOString().split('T')[0] || 'confirmed'}).`,
      existing_id: existingClaim.id,
      already_timestamped: true
    };
  }
  
  // Store document temporarily if provided (for sending to signers)
  let fileId = null;
  if (documentData) {
    fileId = 'sf_' + crypto.randomBytes(16).toString('base64url');
    const fileBuffer = Buffer.from(documentData, 'base64');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    await db.collection('sign_files').insertOne({
      file_id: fileId,
      filename: filename || 'document',
      hash: documentHash,
      data: fileBuffer,
      size: fileBuffer.length,
      mime_type: documentType || 'application/octet-stream',
      created_at: new Date(),
      expires_at: expiresAt,
      ttl_hours: 24, // 24 hours
      from_email: true, // Flag that this came from email flow
      creator_email: fromEmail, // For purge notifications
      purge_notified: false
    });
    
    console.log(`[EmailCreate] Stored document as ${fileId}`);
  }
  
  // Check if sender wants to require OTRUST Proof (body/subject contains +proof)
  const bodyLower = (body || '').toLowerCase();
  const subjectLower = (subject || '').toLowerCase();
  const requireProofAll = bodyLower.includes('+proof') || 
                          bodyLower.includes('require proof') ||
                          subjectLower.includes('+proof');
  
  // Build parties list from unique signers
  const parties = uniqueSigners.map(email => ({
    email,
    role: 'signer',
    requireOtrustProof: requireProofAll  // Apply proof requirement if +proof in email
  }));
  
  // Add sender as signer if they wrote "+me" etc and aren't already in list
  if (senderSigns && !uniqueSigners.includes(fromEmail.toLowerCase())) {
    parties.push({
      email: fromEmail,
      role: 'signer',
      requireOtrustProof: requireProofAll
    });
  }
  
  // Use email subject as title, fallback to filename
  const title = subject?.replace(/^(re:|fwd:|sign:?)\s*/gi, '').trim() || filename || 'Document';
  
  console.log(`[EmailCreate] Creating sign request from ${fromEmail}: "${title}" with ${parties.length} signers`);
  
  try {
    const result = await createSignRequest({
      documentHash,
      title,
      filename,
      documentUrl: fileId ? `/sign/file/${fileId}` : null, // Link to stored file
      documentFileId: fileId, // Store file ID for email attachment
      parties,
      signingOrder: 'parallel',
      deadline: null, // Default 30 days
      creatorEmail: fromEmail,
      message: body?.substring(0, 500) || null // First 500 chars of email body as message
    });
    
    console.log(`[EmailCreate] Created sign request ${result.sign_id}${requireProofAll ? ' (proof required)' : ''}`);
    
    return {
      success: true,
      sign_id: result.sign_id,
      view_token: result.view_token, // Return for creator
      title: result.title,
      parties_count: parties.length,
      proof_required: requireProofAll,
      message: `Sign request created! ${parties.length} signers will receive invitations.${requireProofAll ? ' OTRUST Proof verification required.' : ''}`
    };
    
  } catch (error) {
    console.error('[EmailCreate] Failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Clean up email addresses after completion/expiry (GDPR)
 */
export async function cleanupEmails(signId) {
  const db = getDb();
  
  await db.collection('sign_requests').updateOne(
    { id: signId },
    { 
      $set: { 
        creator_email: null,
        'parties.$[].email': null
      } 
    }
  );
}

export default {
  createSignRequest,
  createSignRequestFromEmail,
  getSignRequest,
  getSignRequestByToken,
  verifyDocumentHash,
  completeSignature,
  cancelSignRequest,
  sendReminder,
  getSignaturePackage,
  processMailtoSign,
  processEmailSign,
  cleanupEmails
};
