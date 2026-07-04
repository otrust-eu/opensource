import { useState, useRef } from 'react'
import { timestamp, sign, proof, auth, configure, sha256, hashFile, generateEd25519Keypair, signEd25519, verifyEd25519 } from '@otrust/sdk'

configure({ baseUrl: 'https://otrust.eu' })

type Tab = 'timestamp' | 'sign' | 'proof' | 'auth' | 'crypto' | 'react'

// Shared Components
const CodeBlock = ({ lang, code }: { lang: string; code: string }) => (
  <div className="code-block">
    <div className="code-header">
      <span className="code-lang">{lang}</span>
      <button className="copy-btn" onClick={() => navigator.clipboard.writeText(code)}>Copy</button>
    </div>
    <pre><code>{code}</code></pre>
  </div>
)

const FileDrop = ({ onFile, file, hash }: { onFile: (f: File, h: string) => void; file: File | null; hash: string }) => {
  const [drag, setDrag] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const handle = async (f: File) => {
    const h = await hashFile(f)
    onFile(f, h)
  }
  return (
    <div
      className={`file-drop ${drag ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); e.dataTransfer.files[0] && handle(e.dataTransfer.files[0]) }}
      onClick={() => ref.current?.click()}
    >
      <input ref={ref} type="file" hidden onChange={e => e.target.files?.[0] && handle(e.target.files[0])} />
      {file ? (
        <div className="file-info">
          <span className="file-name">{file.name}</span>
          <span className="file-meta">{(file.size / 1024).toFixed(1)} KB</span>
          <span className="file-hash">{hash.slice(0, 16)}...{hash.slice(-8)}</span>
        </div>
      ) : <span className="file-placeholder">Drop file or click to select</span>}
    </div>
  )
}

const Btn = ({ onClick, loading, children, secondary }: { onClick: () => void; loading?: boolean; children: React.ReactNode; secondary?: boolean }) => (
  <button className={`action-btn ${secondary ? 'secondary' : 'primary'}`} onClick={onClick} disabled={loading}>
    {loading ? 'Loading...' : children}
  </button>
)

// Timestamp Tab
function TimestampCreate() {
  const [file, setFile] = useState<File | null>(null)
  const [hash, setHash] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const create = async () => {
    if (!hash) return
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await timestamp.create(hash, email ? { email } : undefined)
      if (r.ok) setResult(r.value)
      else setError(r.error.message)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div className="function-card">
      <h3>timestamp.create()</h3>
      <p>Create a blockchain timestamp proof for any file</p>
      <FileDrop onFile={(f, h) => { setFile(f); setHash(h) }} file={file} hash={hash} />
      <div className="input-group" style={{ marginTop: '1rem' }}>
        <label>Email (optional)</label>
        <input className="text-input" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <Btn onClick={create} loading={loading}>Create Timestamp</Btn>
      {error && <div className="error-box">{error}</div>}
      {result && (
        <div className="result-box success">
          <div className="result-header"><span className="result-title">Timestamp Created</span></div>
          <div className="hash-result"><code>{result.id}</code><button className="copy-small" onClick={() => navigator.clipboard.writeText(result.id)}>Copy</button></div>
          <a className="link-btn" href={`https://otrust.eu/proof/${result.id}`} target="_blank">View Proof</a>
        </div>
      )}
      <div className="sdk-code">
        <CodeBlock lang="typescript" code={`import { timestamp, hashFile } from '@otrust/sdk'

const hash = await hashFile(file)
const result = await timestamp.create(hash${email ? `, '${email}'` : ''})`} />
      </div>
    </div>
  )
}

function TimestampVerify() {
  const [file, setFile] = useState<File | null>(null)
  const [hash, setHash] = useState('')
  const [manualHash, setManualHash] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const verify = async () => {
    const h = hash || manualHash
    if (!h) return
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await timestamp.verify(h)
      if (r.ok) setResult(r.value)
      else setError(r.error.message)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div className="function-card">
      <h3>timestamp.verify()</h3>
      <p>Verify when a file was timestamped on the blockchain</p>
      <FileDrop onFile={(f, h) => { setFile(f); setHash(h); setManualHash('') }} file={file} hash={hash} />
      <div className="divider-text">or enter hash directly</div>
      <input className="text-input mono" placeholder="SHA-256 hash" value={manualHash} onChange={e => { setManualHash(e.target.value); setFile(null); setHash('') }} />
      <Btn onClick={verify} loading={loading}>Verify Timestamp</Btn>
      {error && <div className="error-box">{error}</div>}
      {result && (
        <div className={`result-box ${result.verified ? 'success' : 'error'}`}>
          <div className="result-header">
            <span className="result-title">{result.verified ? 'Verified ' : 'Not Found'}</span>
            <span className={`status-badge ${result.status === 'confirmed' ? 'success' : 'warning'}`}>{result.status}</span>
          </div>
          {result.timestamp && <p style={{ fontSize: '0.85rem' }}>Timestamped: {new Date(result.timestamp).toLocaleString()}</p>}
        </div>
      )}
      <div className="sdk-code">
        <CodeBlock lang="typescript" code={`import { timestamp } from '@otrust/sdk'

const result = await timestamp.verify('${hash || manualHash || '<hash>'}')`} />
      </div>
    </div>
  )
}

function TimestampBulk() {
  const [hashes, setHashes] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const verify = async () => {
    const arr = hashes.split('\n').map(h => h.trim()).filter(Boolean)
    if (!arr.length) return
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await timestamp.verifyBulk(arr)
      if (r.ok) setResult(r.value)
      else setError(r.error.message)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div className="function-card">
      <h3>timestamp.verifyBulk()</h3>
      <p>Verify multiple timestamps in one API call</p>
      <div className="input-group">
        <label>Hashes (one per line)</label>
        <textarea className="text-input mono" rows={4} placeholder="hash1&#10;hash2&#10;hash3" value={hashes} onChange={e => setHashes(e.target.value)} />
      </div>
      <Btn onClick={verify} loading={loading}>Verify All</Btn>
      {error && <div className="error-box">{error}</div>}
      {result && (
        <div className="result-box success">
          <div className="result-header"><span className="result-title">Bulk Results</span></div>
          <div style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
            {result.results?.map((r: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span className={`status-badge ${r.verified ? 'success' : 'error'}`}>{r.verified ? '' : ''}</span>
                <code style={{ fontSize: '0.7rem' }}>{r.hash?.slice(0, 20)}...</code>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="sdk-code">
        <CodeBlock lang="typescript" code={`import { timestamp } from '@otrust/sdk'

const results = await timestamp.verifyBulk([
  'hash1...',
  'hash2...'
])`} />
      </div>
    </div>
  )
}

function TimestampReceipt() {
  const [id, setId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const get = async () => {
    if (!id) return
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await timestamp.getProof(id)
      if (r.ok) setResult(r.value)
      else setError(r.error.message)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div className="function-card">
      <h3>timestamp.getProof()</h3>
      <p>Get the proof details for a timestamp</p>
      <div className="input-group">
        <label>Timestamp ID</label>
        <input className="text-input mono" placeholder="ot_..." value={id} onChange={e => setId(e.target.value)} />
      </div>
      <Btn onClick={get} loading={loading}>Get Proof</Btn>
      {error && <div className="error-box">{error}</div>}
      {result && (
        <div className="result-box success">
          <div className="result-header"><span className="result-title">Proof Retrieved</span></div>
          <CodeBlock lang="json" code={JSON.stringify(result, null, 2)} />
        </div>
      )}
      <div className="sdk-code">
        <CodeBlock lang="typescript" code={`import { timestamp } from '@otrust/sdk'

const proof = await timestamp.getProof('${id || 'ot_xxx'}')`} />
      </div>
    </div>
  )
}

// Sign Tab
function SignCreate() {
  const [doc, setDoc] = useState('')
  const [title, setTitle] = useState('')
  const [parties, setParties] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const create = async () => {
    if (!doc || !parties || !title) return
    setLoading(true); setError(''); setResult(null)
    try {
      const partiesArr = parties.split(',').map(p => p.trim()).filter(Boolean).map(email => ({ email, role: 'signer' as const }))
      const r = await sign.create(doc, { title, parties: partiesArr, creatorEmail: 'demo@otrust.eu' })
      if (r.ok) setResult(r.value)
      else setError(r.error.message)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div className="function-card">
      <h3>sign.create()</h3>
      <p>Create a multi-party document signature request</p>
      <div className="input-row">
        <div className="input-group">
          <label>Title (optional)</label>
          <input className="text-input" placeholder="Contract Name" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="input-group">
          <label>Parties (comma-separated emails)</label>
          <input className="text-input" placeholder="alice@x.com, bob@y.com" value={parties} onChange={e => setParties(e.target.value)} />
        </div>
      </div>
      <div className="input-group">
        <label>Document content or hash</label>
        <textarea className="text-input" rows={3} placeholder="Document text or SHA-256 hash" value={doc} onChange={e => setDoc(e.target.value)} />
      </div>
      <Btn onClick={create} loading={loading}>Create Signature Request</Btn>
      {error && <div className="error-box">{error}</div>}
      {result && (
        <div className="result-box success">
          <div className="result-header"><span className="result-title">Signature Request Created</span></div>
          <div className="hash-result"><code>{result.id}</code><button className="copy-small" onClick={() => navigator.clipboard.writeText(result.id)}>Copy</button></div>
        </div>
      )}
      <div className="sdk-code">
        <CodeBlock lang="typescript" code={`import { sign } from '@otrust/sdk'

const result = await sign.create({
  document: '${doc.slice(0, 30) || '<content>'}...',
  parties: [{ email: 'alice@x.com' }],
  title: '${title || 'My Document'}'
})`} />
      </div>
    </div>
  )
}

function SignStatus() {
  const [id, setId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const get = async () => {
    if (!id) return
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await sign.status(id)
      setResult(r)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div className="function-card">
      <h3>sign.status()</h3>
      <p>Check the status of a signature request</p>
      <div className="input-group">
        <label>Signature ID</label>
        <input className="text-input mono" placeholder="sig_..." value={id} onChange={e => setId(e.target.value)} />
      </div>
      <Btn onClick={get} loading={loading}>Get Status</Btn>
      {error && <div className="error-box">{error}</div>}
      {result && (
        <div className="result-box success">
          <div className="result-header">
            <span className="result-title">Signature Status</span>
            <span className={`status-badge ${result.status === 'completed' ? 'success' : 'warning'}`}>{result.status}</span>
          </div>
          {result.parties && (
            <div style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
              {result.parties.map((p: any, i: number) => (
                <div key={i}>{p.email}: <span className={`status-badge ${p.signed ? 'success' : 'warning'}`}>{p.signed ? 'Signed' : 'Pending'}</span></div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="sdk-code">
        <CodeBlock lang="typescript" code={`import { sign } from '@otrust/sdk'

const status = await sign.status('${id || 'sig_xxx'}')`} />
      </div>
    </div>
  )
}

// Proof Tab
function ProofDetails() {
  const [id, setId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const get = async () => {
    if (!id) return
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await proof.get(id)
      if (r.ok) setResult(r.value)
      else setError(r.error.message)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div className="function-card">
      <h3>proof.get()</h3>
      <p>Get metadata about a proof</p>
      <div className="input-group">
        <label>Proof ID</label>
        <input className="text-input mono" placeholder="prf_..." value={id} onChange={e => setId(e.target.value)} />
      </div>
      <Btn onClick={get} loading={loading}>Get Details</Btn>
      {error && <div className="error-box">{error}</div>}
      {result && (
        <div className="result-box success">
          <div className="result-header"><span className="result-title">Proof Details</span></div>
          <CodeBlock lang="json" code={JSON.stringify(result, null, 2)} />
        </div>
      )}
      <div className="sdk-code">
        <CodeBlock lang="typescript" code={`import { proof } from '@otrust/sdk'

const details = await proof.get('${id || 'id_xxx'}')`} />
      </div>
    </div>
  )
}

function ProofVerify() {
  const [id, setId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const verify = async () => {
    if (!id) return
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await proof.verify(id)
      if (r.ok) setResult(r.value)
      else setError(r.error.message)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div className="function-card">
      <h3>proof.verify()</h3>
      <p>Verify a proof using its ID</p>
      <div className="input-group">
        <label>Proof ID</label>
        <input className="text-input mono" placeholder="id_..." value={id} onChange={e => setId(e.target.value)} />
      </div>
      <Btn onClick={verify} loading={loading}>Verify Proof</Btn>
      {error && <div className="error-box">{error}</div>}
      {result && (
        <div className={`result-box ${result.valid ? 'success' : 'error'}`}>
          <div className="result-header">
            <span className="result-title">{result.valid ? 'Proof Valid ' : 'Invalid'}</span>
          </div>
          {result.data && <CodeBlock lang="json" code={JSON.stringify(result.data, null, 2)} />}
        </div>
      )}
      <div className="sdk-code">
        <CodeBlock lang="typescript" code={`import { proof } from '@otrust/sdk'

const result = await proof.verify('${id || 'id_xxx'}')`} />
      </div>
    </div>
  )
}

// Auth Tab
function AuthChallenge() {
  const [clientId, setClientId] = useState('demo-app')
  const [redirectUri, setRedirectUri] = useState('https://example.com/callback')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const create = async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await auth.createChallenge({ clientId, redirectUri, scope: ['identity'] })
      if (r.ok) setResult(r.value)
      else setError(r.error.message)
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div className="function-card">
      <h3>auth.createChallenge()</h3>
      <p>Create an authentication challenge for "Login with OTRUST"</p>
      <div className="input-row">
        <div className="input-group">
          <label>Client ID</label>
          <input className="text-input" placeholder="my-app" value={clientId} onChange={e => setClientId(e.target.value)} />
        </div>
        <div className="input-group">
          <label>Redirect URI</label>
          <input className="text-input" placeholder="https://..." value={redirectUri} onChange={e => setRedirectUri(e.target.value)} />
        </div>
      </div>
      <Btn onClick={create} loading={loading}>Create Challenge</Btn>
      {error && <div className="error-box">{error}</div>}
      {result && (
        <div className="result-box success">
          <div className="result-header"><span className="result-title">Challenge Created</span></div>
          <div className="hash-result"><code>{result.challengeId || result.id}</code><button className="copy-small" onClick={() => navigator.clipboard.writeText(result.challengeId || result.id)}>Copy</button></div>
          {result.qrUrl && <img src={result.qrUrl} alt="QR" style={{ width: 150, marginTop: '0.5rem' }} />}
        </div>
      )}
      <div className="sdk-code">
        <CodeBlock lang="typescript" code={`import { auth } from '@otrust/sdk'

// Create challenge for user to authenticate
const challenge = await auth.createChallenge()

// Show QR code or redirect
console.log(challenge.qrUrl)`} />
      </div>
    </div>
  )
}

// Crypto Tab
function CryptoHash() {
  const [file, setFile] = useState<File | null>(null)
  const [hash, setHash] = useState('')
  const [text, setText] = useState('')
  const [textHash, setTextHash] = useState('')

  const hashText = async () => {
    if (!text) return
    const h = await sha256(text)
    setTextHash(h)
  }

  return (
    <div className="function-card">
      <h3>sha256() / hashFile()</h3>
      <p>Hash strings or files using SHA-256</p>
      <FileDrop onFile={(f, h) => { setFile(f); setHash(h) }} file={file} hash={hash} />
      {hash && (
        <div className="hash-result">
          <code>{hash}</code>
          <button className="copy-small" onClick={() => navigator.clipboard.writeText(hash)}>Copy</button>
        </div>
      )}
      <div className="divider-text">or hash text</div>
      <div className="input-group">
        <input className="text-input" placeholder="Enter text to hash" value={text} onChange={e => setText(e.target.value)} />
      </div>
      <Btn onClick={hashText} secondary>Hash Text</Btn>
      {textHash && (
        <div className="hash-result">
          <code>{textHash}</code>
          <button className="copy-small" onClick={() => navigator.clipboard.writeText(textHash)}>Copy</button>
        </div>
      )}
      <div className="sdk-code">
        <CodeBlock lang="typescript" code={`import { sha256, hashFile } from '@otrust/sdk'

// Hash a string
const textHash = await sha256('Hello World')

// Hash a file
const fileHash = await hashFile(file)`} />
      </div>
    </div>
  )
}

function CryptoEd25519() {
  const [keypair, setKeypair] = useState<{ publicKey: string; privateKey: string } | null>(null)
  const [message, setMessage] = useState('')
  const [signature, setSignature] = useState('')
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null)

  const generate = async () => {
    const kp = await generateEd25519Keypair()
    setKeypair(kp)
  }

  const signMsg = async () => {
    if (!keypair || !message) return
    const sig = await signEd25519(message, keypair.privateKey)
    setSignature(sig)
    setVerifyResult(null)
  }

  const verify = async () => {
    if (!keypair || !message || !signature) return
    const valid = await verifyEd25519(message, signature, keypair.publicKey)
    setVerifyResult(valid)
  }

  return (
    <div className="function-card">
      <h3>Ed25519 Cryptography</h3>
      <p>Generate keypairs, sign and verify messages</p>
      <Btn onClick={generate}>Generate Keypair</Btn>
      {keypair && (
        <div className="keypair-result">
          <div className="input-group">
            <label>Public Key</label>
            <div className="hash-result" style={{ marginTop: 0 }}>
              <code>{keypair.publicKey.slice(0, 32)}...</code>
              <button className="copy-small" onClick={() => navigator.clipboard.writeText(keypair.publicKey)}>Copy</button>
            </div>
          </div>
          <div className="input-group">
            <label>Private Key</label>
            <div className="hash-result" style={{ marginTop: 0 }}>
              <code>{keypair.privateKey.slice(0, 32)}...</code>
              <button className="copy-small" onClick={() => navigator.clipboard.writeText(keypair.privateKey)}>Copy</button>
            </div>
          </div>
          <div className="input-group" style={{ marginTop: '1rem' }}>
            <label>Message to sign</label>
            <input className="text-input" placeholder="Hello World" value={message} onChange={e => setMessage(e.target.value)} />
          </div>
          <Btn onClick={signMsg} secondary>Sign Message</Btn>
          {signature && (
            <>
              <div className="hash-result">
                <code>{signature.slice(0, 40)}...</code>
                <button className="copy-small" onClick={() => navigator.clipboard.writeText(signature)}>Copy</button>
              </div>
              <Btn onClick={verify} secondary>Verify Signature</Btn>
              {verifyResult !== null && (
                <div className={`result-box ${verifyResult ? 'success' : 'error'}`} style={{ marginTop: '0.5rem' }}>
                  <span className="result-title">{verifyResult ? 'Signature Valid ' : 'Invalid Signature'}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
      <div className="sdk-code">
        <CodeBlock lang="typescript" code={`import { generateEd25519Keypair, signEd25519, verifyEd25519 } from '@otrust/sdk'

const { publicKey, privateKey } = await generateEd25519Keypair()
const signature = await signEd25519('message', privateKey)
const valid = await verifyEd25519('message', signature, publicKey)`} />
      </div>
    </div>
  )
}

// React Components Tab
function ReactTimestampWidget() {
  return (
    <div className="function-card">
      <h3>{'<TimestampWidget />'}</h3>
      <p>Drag-and-drop file upload for creating timestamps</p>
      
      <div className="component-demo">
        <div className="demo-box">
          <div className="demo-widget timestamp-widget-demo">
            <div className="widget-dropzone">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
              <span>Drop files to timestamp</span>
            </div>
          </div>
        </div>
      </div>

      <div className="props-table">
        <h4>Props</h4>
        <table>
          <tbody>
            <tr><td><code>onTimestamp</code></td><td>Callback when timestamp created</td></tr>
            <tr><td><code>onError</code></td><td>Error callback</td></tr>
            <tr><td><code>multiple</code></td><td>Allow multiple files</td></tr>
            <tr><td><code>showProgress</code></td><td>Show hashing progress</td></tr>
            <tr><td><code>notifyEmail</code></td><td>Email for confirmation</td></tr>
          </tbody>
        </table>
      </div>

      <div className="sdk-code">
        <CodeBlock lang="tsx" code={`import { TimestampWidget } from '@otrust/react'

<TimestampWidget
  onTimestamp={(claim) => {
    console.log('Created:', claim.receiptId)
  }}
  onError={(err) => console.error(err)}
  showProgress
  notifyEmail="user@example.com"
/>`} />
      </div>
    </div>
  )
}

function ReactLoginButton() {
  return (
    <div className="function-card">
      <h3>{'<LoginWithOTrust />'}</h3>
      <p>"Login with OTRUST" authentication button</p>
      
      <div className="component-demo">
        <div className="demo-box">
          <button className="demo-login-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Login with OTRUST
          </button>
          <button className="demo-login-btn secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Login with OTRUST
          </button>
        </div>
      </div>

      <div className="props-table">
        <h4>Props</h4>
        <table>
          <tbody>
            <tr><td><code>clientId</code></td><td>Your app's client ID</td></tr>
            <tr><td><code>redirectUri</code></td><td>Callback URL after auth</td></tr>
            <tr><td><code>scope</code></td><td>Requested scopes (identity, email)</td></tr>
            <tr><td><code>variant</code></td><td>primary | secondary | minimal</td></tr>
            <tr><td><code>size</code></td><td>small | medium | large</td></tr>
          </tbody>
        </table>
      </div>

      <div className="sdk-code">
        <CodeBlock lang="tsx" code={`import { LoginWithOTrust } from '@otrust/react'

<LoginWithOTrust
  clientId="my-app"
  redirectUri="https://my-app.com/callback"
  scope={['identity', 'email']}
  onAuthStart={() => setLoading(true)}
  onError={(err) => console.error(err)}
/>`} />
      </div>
    </div>
  )
}

function ReactProofBadge() {
  return (
    <div className="function-card">
      <h3>{'<ProofBadge />'}</h3>
      <p>Display verification status badge</p>
      
      <div className="component-demo">
        <div className="demo-box" style={{ gap: '1rem' }}>
          <div className="demo-badge verified">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Verified
          </div>
          <div className="demo-badge pending">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Pending
          </div>
          <div className="demo-badge expired">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            Expired
          </div>
        </div>
      </div>

      <div className="props-table">
        <h4>Props</h4>
        <table>
          <tbody>
            <tr><td><code>proofId</code></td><td>Proof ID to display</td></tr>
            <tr><td><code>showDetails</code></td><td>Show expanded details</td></tr>
            <tr><td><code>onVerify</code></td><td>Callback when clicked</td></tr>
            <tr><td><code>variant</code></td><td>badge | card | inline</td></tr>
          </tbody>
        </table>
      </div>

      <div className="sdk-code">
        <CodeBlock lang="tsx" code={`import { ProofBadge } from '@otrust/react'

<ProofBadge
  proofId="prf_abc123"
  showDetails
  onVerify={(result) => {
    console.log('Verified:', result.valid)
  }}
/>`} />
      </div>
    </div>
  )
}

function ReactSignatureStatus() {
  return (
    <div className="function-card">
      <h3>{'<SignatureStatus />'}</h3>
      <p>Real-time signature request status</p>
      
      <div className="component-demo">
        <div className="demo-box">
          <div className="demo-sig-status">
            <div className="sig-header">
              <span className="sig-title">Contract Agreement</span>
              <span className="demo-badge pending" style={{ fontSize: '0.7rem' }}>2/3 signed</span>
            </div>
            <div className="sig-parties">
              <div className="sig-party signed">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                alice@example.com
              </div>
              <div className="sig-party signed">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                bob@example.com
              </div>
              <div className="sig-party pending">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
                carol@example.com
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="props-table">
        <h4>Props</h4>
        <table>
          <tbody>
            <tr><td><code>requestId</code></td><td>Signature request ID</td></tr>
            <tr><td><code>pollInterval</code></td><td>Auto-refresh interval (ms)</td></tr>
            <tr><td><code>onComplete</code></td><td>Callback when all signed</td></tr>
            <tr><td><code>showTimeline</code></td><td>Show signature timeline</td></tr>
          </tbody>
        </table>
      </div>

      <div className="sdk-code">
        <CodeBlock lang="tsx" code={`import { SignatureStatus } from '@otrust/react'

<SignatureStatus
  requestId="sig_xyz789"
  pollInterval={5000}
  onComplete={(result) => {
    console.log('All parties signed!')
  }}
  showTimeline
/>`} />
      </div>
    </div>
  )
}

function ReactHooks() {
  return (
    <div className="function-card">
      <h3>React Hooks</h3>
      <p>Custom hooks for common operations</p>
      
      <div className="hooks-list">
        <div className="hook-item">
          <code>useAuth()</code>
          <span>Handle authentication state</span>
        </div>
        <div className="hook-item">
          <code>useProof(proofId)</code>
          <span>Fetch and verify proofs</span>
        </div>
        <div className="hook-item">
          <code>useTimestamp()</code>
          <span>Create timestamps with state</span>
        </div>
        <div className="hook-item">
          <code>useOTrust()</code>
          <span>Access context configuration</span>
        </div>
      </div>

      <div className="sdk-code">
        <CodeBlock lang="tsx" code={`import { useAuth, useProof, useTimestamp, OTrustProvider } from '@otrust/react'

// Wrap app with provider
<OTrustProvider clientId="my-app" redirectUri="/callback">
  <App />
</OTrustProvider>

// In components:
function MyComponent() {
  const { user, login, logout } = useAuth()
  const { data, loading, verify } = useProof('prf_123')
  const { create, status } = useTimestamp()
  
  return user ? <p>Hello {user.email}</p> : <button onClick={login}>Login</button>
}`} />
      </div>
    </div>
  )
}

// Main App
export default function App() {
  const [tab, setTab] = useState<Tab>('timestamp')

  return (
    <div className="app">
      <nav className="main-nav">
        <div className="nav-container">
          <a href="https://otrust.eu" className="logo">OTRUST</a>
          <div className="nav-links">
            <span className="nav-primary">
              <a href="https://otrust.eu/">Timestamp</a>
              <a href="https://otrust.eu/sign" className="signed-link">Signed</a>
              <a href="https://otrust.eu/proof">Proof</a>
            </span>
            <span className="nav-secondary">
              <a href="https://otrust.eu/sign-in">Sign in</a>
              <a href="https://otrust.eu/docs" className="docs-trigger open">Docs</a>
              <a href="https://otrust.eu/about">About</a>
            </span>
          </div>
        </div>
      </nav>
      
      <div className="docs-submenu-bar open">
        <div className="docs-submenu-container">
          <a href="https://otrust.eu/docs">Documentation</a>
          <a href="https://otrust.eu/api-docs">API Reference</a>
          <a href="https://otrust.eu/playground/" className="active">SDK Playground</a>
          <a href="https://github.com/otrust-eu/core" target="_blank">GitHub ↗</a>
        </div>
      </div>
      <main className="app-main">
        <div className="tabs">
          <button className={`tab ${tab === 'timestamp' ? 'active' : ''}`} onClick={() => setTab('timestamp')}>Timestamp</button>
          <button className={`tab ${tab === 'sign' ? 'active' : ''}`} onClick={() => setTab('sign')}>Sign</button>
          <button className={`tab ${tab === 'proof' ? 'active' : ''}`} onClick={() => setTab('proof')}>Proof</button>
          <button className={`tab ${tab === 'auth' ? 'active' : ''}`} onClick={() => setTab('auth')}>Auth</button>
          <button className={`tab ${tab === 'crypto' ? 'active' : ''}`} onClick={() => setTab('crypto')}>Crypto</button>
          <button className={`tab ${tab === 'react' ? 'active' : ''}`} onClick={() => setTab('react')}>React</button>
        </div>

        {tab === 'timestamp' && (
          <div className="functions-grid">
            <TimestampCreate />
            <TimestampVerify />
            <TimestampBulk />
            <TimestampReceipt />
          </div>
        )}

        {tab === 'sign' && (
          <div className="functions-grid">
            <SignCreate />
            <SignStatus />
          </div>
        )}

        {tab === 'proof' && (
          <div className="functions-grid">
            <ProofDetails />
            <ProofVerify />
          </div>
        )}

        {tab === 'auth' && (
          <div className="functions-grid">
            <AuthChallenge />
          </div>
        )}

        {tab === 'crypto' && (
          <div className="functions-grid">
            <CryptoHash />
            <CryptoEd25519 />
          </div>
        )}

        {tab === 'react' && (
          <div className="functions-grid">
            <ReactTimestampWidget />
            <ReactLoginButton />
            <ReactProofBadge />
            <ReactSignatureStatus />
            <ReactHooks />
          </div>
        )}
      </main>
      <footer className="app-footer">
        <p>OTRUST SDK v1.0  Privacy-first identity, signatures and timestamp proofs</p>
      </footer>
    </div>
  )
}

