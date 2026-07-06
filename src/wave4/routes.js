import archiver from 'archiver';
import { buildEvidenceBundleMeta, instructionsText } from './evidence-bundle.js';
import { buildTransparencyRss } from './transparency-feed.js';
import { createCeremony, getCeremony, joinCeremony, attestCeremony } from './ceremony.js';
import { createCommitment, getCommitment, revealCommitment, hashPreimage } from './commitments.js';

function baseUrl() {
  return process.env.BASE_URL || 'https://www.otrust.eu';
}

export function registerWave4Routes(app, { getDb, getTimestampInfo, sanitizeString, bulkJson }) {
  // GET /proof/:id/evidence.zip — legal evidence bundle
  app.get('/proof/:receiptId/evidence.zip', async (req, res) => {
    try {
      const receiptId = sanitizeString(req.params.receiptId);
      if (!receiptId) return res.status(400).json({ error: 'invalid_receipt_id' });

      const db = getDb();
      const claim = await db.collection('claims').findOne({ id: receiptId });
      if (!claim) return res.status(404).json({ error: 'not_found' });

      const info = claim.ots_proof ? await getTimestampInfo(claim.ots_proof) : {};
      const meta = buildEvidenceBundleMeta(claim, receiptId, info);

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${receiptId}-evidence.zip"`);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err) => {
        console.error('[Evidence] ZIP error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'zip_failed' });
      });
      archive.pipe(res);

      archive.append(JSON.stringify(meta, null, 2), { name: 'proof.json' });
      archive.append(instructionsText(receiptId), { name: 'VERIFY.txt' });
      if (claim.ots_proof) {
        archive.append(Buffer.from(claim.ots_proof, 'base64'), { name: 'receipt.ots' });
      }
      await archive.finalize();
    } catch (error) {
      console.error('[Evidence] Bundle error:', error.message);
      if (!res.headersSent) res.status(500).json({ error: 'server_error' });
    }
  });

  // GET /transparency/feed.xml
  app.get('/transparency/feed.xml', async (req, res) => {
    try {
      const db = getDb();
      const xml = await buildTransparencyRss(db, baseUrl());
      res.set('Content-Type', 'application/rss+xml; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=300');
      res.send(xml);
    } catch (error) {
      console.error('[RSS] Feed error:', error.message);
      res.status(500).send('<?xml version="1.0"?><rss version="2.0"><channel><title>Error</title></channel></rss>');
    }
  });

  // GET /api/domain-trust?host=example.com
  app.get('/api/domain-trust', async (req, res) => {
    const host = String(req.query.host || '').toLowerCase().replace(/^www\./, '').slice(0, 253);
    if (!host || !/^[a-z0-9.-]+$/.test(host)) {
      return res.status(400).json({ error: 'invalid_host' });
    }
    res.json({
      host,
      otrust_embed: host === 'otrust.eu' || host.endsWith('.otrust.eu'),
      transparency_url: `${baseUrl()}/transparency`,
      verify_url: `${baseUrl()}/timestamp#verify`,
      message: 'Domain trust is advisory. Verify individual records via receipt ID or hash.'
    });
  });

  // Ceremony API
  app.post('/api/ceremony', bulkJson, async (req, res) => {
    try {
      const { hash, creator } = req.body || {};
      const room = createCeremony(hash, creator);
      res.status(201).json({
        room_id: room.id,
        hash: room.hash,
        join_url: `${baseUrl()}/ceremony#${room.id}`
      });
    } catch (error) {
      res.status(400).json({ error: error.message || 'invalid_request' });
    }
  });

  app.get('/api/ceremony/:id', (req, res) => {
    const room = getCeremony(req.params.id);
    if (!room) return res.status(404).json({ error: 'not_found' });
    res.json(room);
  });

  app.post('/api/ceremony/:id/join', bulkJson, (req, res) => {
    const result = joinCeremony(req.params.id, req.body || {});
    if (!result) return res.status(404).json({ error: 'not_found' });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  });

  app.post('/api/ceremony/:id/attest', bulkJson, (req, res) => {
    const result = attestCeremony(req.params.id, req.body || {});
    if (!result) return res.status(404).json({ error: 'not_found' });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  });

  // Time-lock commitments
  app.post('/api/commitment', bulkJson, async (req, res) => {
    try {
      const db = getDb();
      const result = await createCommitment(db, req.body || {});
      if (result.error) return res.status(400).json(result);
      res.status(201).json(result);
    } catch (error) {
      console.error('[Commitment] Create error:', error.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  app.get('/api/commitment/:id', async (req, res) => {
    try {
      const db = getDb();
      const doc = await getCommitment(db, req.params.id);
      if (!doc) return res.status(404).json({ error: 'not_found' });
      res.json(doc);
    } catch (error) {
      res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/commitment/:id/reveal', bulkJson, async (req, res) => {
    try {
      const db = getDb();
      const { preimage } = req.body || {};
      if (!preimage) return res.status(400).json({ error: 'missing_preimage' });
      const result = await revealCommitment(db, req.params.id, preimage);
      if (result.error) return res.status(400).json(result);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/commitment/preview-hash', bulkJson, (req, res) => {
    const { preimage } = req.body || {};
    if (!preimage) return res.status(400).json({ error: 'missing_preimage' });
    res.json({ commitment_hash: hashPreimage(preimage) });
  });

  // Partner theme preview
  app.post('/api/partner-theme/preview', bulkJson, (req, res) => {
    const { partner_name, headline, subhead, accent, logo_text } = req.body || {};
    res.json({
      preview: {
        partner_name: String(partner_name || 'Partner').slice(0, 64),
        headline: String(headline || 'Sign in with OTRUST ID').slice(0, 120),
        subhead: String(subhead || 'Secure verification via OTRUST').slice(0, 200),
        accent: String(accent || '#2d5a3d').slice(0, 32),
        logo_text: String(logo_text || 'Partner').slice(0, 32),
        disclosure: 'Secure verification via OTRUST',
        hosted_url: `${baseUrl()}/auth/login`
      }
    });
  });
}