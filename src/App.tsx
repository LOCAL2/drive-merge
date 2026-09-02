import { useState, useEffect, useCallback } from 'react';
import './index.css';

const API_URL = 'http://localhost:3001/api';

type ToastInfo = { id: number; message: string; type: 'success' | 'error' };

function App() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [quota, setQuota] = useState<{ totalLimit: number; totalUsage: number; accounts: any[] } | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [toasts, setToasts] = useState<ToastInfo[]>([]);

  useEffect(() => {
    fetchData();
    window.addEventListener('message', handleAuthMessage);
    return () => window.removeEventListener('message', handleAuthMessage);
  }, []);

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const handleAuthMessage = (event: MessageEvent) => {
    if (event.data === 'google-auth-success') {
      showToast('Successfully connected Google Account', 'success');
      fetchData();
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const accRes = await fetch(`${API_URL}/auth/accounts`);
      const accData = await accRes.json();
      setAccounts(accData);

      if (accData.length > 0) {
        // Fetch Quota and Files concurrently
        const [qRes, fRes] = await Promise.all([
          fetch(`${API_URL}/drive/quota`),
          fetch(`${API_URL}/drive/files`)
        ]);
        
        setQuota(await qRes.json());
        const data = await fRes.json();
        // Since we changed backend to return { files: [...] }
        setFiles(data.files || []);
      }
    } catch (e) {
      console.error('Failed to fetch data', e);
      showToast('Failed to load data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = () => {
    window.open(`${API_URL}/auth/google`, 'GoogleLogin', 'width=500,height=600');
  };

  const handleDrag = useCallback((e: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleMultiUpload(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleUploadClick = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.onchange = (event: any) => {
      if (event.target.files && event.target.files.length > 0) {
        handleMultiUpload(Array.from(event.target.files));
      }
    };
    fileInput.click();
  };

  const handleMultiUpload = async (filesToUpload: File[]) => {
    setIsUploading(true);
    let successCount = 0;
    
    for (const file of filesToUpload) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch(`${API_URL}/drive/upload`, {
          method: 'POST',
          body: formData,
        });
        if (res.ok) successCount++;
      } catch (e) {
        console.error('Upload error', e);
      }
    }
    
    setIsUploading(false);
    showToast(`Successfully uploaded ${successCount}/${filesToUpload.length} files`, 'success');
    await fetchData();
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const getStoragePercentage = () => {
    if (!quota || quota.totalLimit === 0) return 0;
    return (quota.totalUsage / quota.totalLimit) * 100;
  };

  return (
    <div className="app-container">
      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <span>{toast.type === 'success' ? '✅' : '❌'}</span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      <header className="header">
        <div>
          <h1><span className="gradient-text">MergeDrive</span> Pro</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Unify your cloud storage effortlessly</p>
        </div>
        <button className="btn btn-primary" onClick={loginWithGoogle}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Connect Account
        </button>
      </header>

      {isLoading && accounts.length === 0 ? (
        <div className="dashboard-grid">
          <div className="glass-panel"><div className="skeleton skeleton-title"></div><div className="skeleton skeleton-text long"></div><div className="skeleton skeleton-text short"></div></div>
          <div>
            <div className="glass-panel" style={{height: '200px', marginBottom: '24px'}}><div className="skeleton skeleton-title"></div></div>
            <div className="file-list">
              {[1,2,3].map(i => <div key={i} className="file-item"><div className="skeleton skeleton-title"></div><div className="skeleton skeleton-text long"></div></div>)}
            </div>
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '80px 20px', maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '16px' }}>Zero accounts connected</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '1.1rem' }}>
            Connect your first Google Drive account to start merging your storage space into one unified powerful dashboard.
          </p>
          <button className="btn btn-primary" style={{ padding: '12px 32px', fontSize: '1.1rem' }} onClick={loginWithGoogle}>
            Connect Google Drive
          </button>
        </div>
      ) : (
        <div className="dashboard-grid">
          {/* Sidebar Dashboard */}
          <div className="sidebar">
            <div className="glass-panel">
              <h3>Storage Summary</h3>
              
              {isLoading ? (
                 <div style={{marginTop: '24px'}}>
                   <div className="skeleton skeleton-text long"></div>
                   <div className="skeleton skeleton-text short"></div>
                 </div>
              ) : (
                <div className="storage-container">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 500 }}>
                    <span>{quota ? formatBytes(quota.totalUsage) : '...'} used</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{quota ? formatBytes(quota.totalLimit) : '...'} total</span>
                  </div>
                  <div className="storage-bar-bg">
                    <div 
                      className="storage-bar-fill" 
                      style={{ width: `${getStoragePercentage()}%` }}
                    ></div>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'right', fontWeight: 500 }}>
                    {getStoragePercentage().toFixed(1)}% full
                  </p>
                </div>
              )}

              <h4 style={{ marginTop: '32px', marginBottom: '16px', fontSize: '1rem', color: 'var(--text-secondary)' }}>Connected Drives ({accounts.length})</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {accounts.map(acc => (
                  <div key={acc.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--panel-border)', padding: '12px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success-color)'}}></div>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acc.email}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="main-content">
            <div 
              className={`upload-area ${dragActive ? 'drag-over' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={handleUploadClick}
            >
              <div className="upload-content">
                <div className="upload-icon">
                  {isUploading ? '⏳' : '☁️'}
                </div>
                <h3 style={{fontSize: '1.4rem'}}>{isUploading ? 'Uploading securely...' : 'Click or Drag & Drop to Upload'}</h3>
                <p style={{ color: 'var(--text-secondary)', marginTop: '12px', maxWidth: '400px', margin: '12px auto 0' }}>
                  MergeDrive intelligently allocates your file to the connected drive with the most available space.
                </p>
              </div>
            </div>

            <div style={{marginTop: '40px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                <h3>All Files <span style={{color: 'var(--text-secondary)', fontWeight: 400, fontSize: '1rem'}}>({files.length})</span></h3>
              </div>
              
              {isLoading && files.length === 0 ? (
                <div className="file-list">
                  {[1,2,3,4].map(i => <div key={i} className="file-item"><div className="skeleton skeleton-title"></div><div className="skeleton skeleton-text long"></div></div>)}
                </div>
              ) : (
                <div className="file-list">
                  
                  {files.map(file => (
                    <div key={file.id} className="file-item">
                      <div style={{display: 'flex'}}>
                        <div className="file-icon-wrapper">
                          <div className="file-icon">{file.mimeType.includes('image') ? '🖼️' : file.mimeType.includes('pdf') ? '📕' : '📄'}</div>
                        </div>
                        <div className="file-info">
                          <div className="file-name" title={file.name}>{file.name}</div>
                          <div className="file-meta">
                            {formatBytes(parseInt(file.size || '0'))}
                          </div>
                        </div>
                      </div>
                      <div className="file-account-badge">
                        {file.accountEmail}
                      </div>
                      <div className="file-actions">
                        <a 
                          href={`${API_URL}/drive/download/${file.accountId}/${file.id}`}
                          className="btn btn-outline"
                          style={{ textDecoration: 'none', width: '100%' }}
                          target="_blank" rel="noreferrer"
                        >
                          Download File
                        </a>
                      </div>
                    </div>
                  ))}
                  {files.length === 0 && !isLoading && (
                    <div className="glass-panel" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
                      No files found across your connected drives. Upload your first file above!
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
