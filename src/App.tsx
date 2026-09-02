import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import './index.css';

const API_URL = 'http://localhost:3001/api';

type ToastInfo = { id: number; message: string; type: 'success' | 'error' };

const SearchBar = ({ onSearch }: { onSearch: (q: string) => void }) => {
  const [val, setVal] = useState('');
  useEffect(() => {
    const t = setTimeout(() => onSearch(val), 250);
    return () => clearTimeout(t);
  }, [val, onSearch]);
  return (
    <input 
      type="text" 
      className="search-input" 
      placeholder="Search in Drive" 
      value={val}
      onChange={(e) => setVal(e.target.value)}
    />
  );
};

function App() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [quota, setQuota] = useState<{ totalLimit: number; totalUsage: number; accounts: any[] } | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [toasts, setToasts] = useState<ToastInfo[]>([]);
  const [isAccountsModalOpen, setIsAccountsModalOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'drive' | 'settings'>('drive');
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<any>(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'device');
  const [privacyMode, setPrivacyMode] = useState(localStorage.getItem('privacyMode') === 'true');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFiles = useMemo(() => {
    if (!searchQuery) return files;
    const lowerQuery = searchQuery.toLowerCase();
    return files.filter(file => file.name.toLowerCase().includes(lowerQuery));
  }, [files, searchQuery]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    const applyTheme = () => {
      let activeTheme = theme;
      if (theme === 'device') {
        activeTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', activeTheme);
    };
    applyTheme();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (theme === 'device') applyTheme(); };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('privacyMode', privacyMode.toString());
    if (privacyMode) {
      document.body.classList.add('privacy-mode');
    } else {
      document.body.classList.remove('privacy-mode');
    }
  }, [privacyMode]);

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
        const [qRes, fRes] = await Promise.all([
          fetch(`${API_URL}/drive/quota`),
          fetch(`${API_URL}/drive/files`)
        ]);

        setQuota(await qRes.json());
        const data = await fRes.json();
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

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleMultiUpload(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleNewClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      handleMultiUpload(Array.from(event.target.files));
    }
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
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const getStoragePercentage = () => {
    if (!quota || quota.totalLimit === 0) return 0;
    return (quota.totalUsage / quota.totalLimit) * 100;
  };

  return (
    <>
      <div className="app-layout">
      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      <input
        type="file"
        multiple
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      <div className="top-bar">
        <div className="top-bar-left">
          <button className="icon-button" style={{ marginLeft: '-12px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--md-sys-color-on-surface-variant)"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" /></svg>
          </button>
          <img src="/Google_Drive_Logo.svg" alt="Google Drive Logo" width="40" height="40" style={{ objectFit: 'contain' }} />
          <h1>DriveMerge</h1>
        </div>

        <div className="search-bar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--md-sys-color-on-surface-variant)"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>
          <SearchBar onSearch={setSearchQuery} />
        </div>

        <div className="top-bar-right">
          <button className="btn-primary" onClick={loginWithGoogle}>
            <div style={{ background: 'white', borderRadius: '50%', padding: '2px', display: 'flex' }}>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            </div>
            Connect Drive
          </button>
        </div>
      </div>

      <div className="body-layout">
        <div className="sidebar">
          <button className="btn-new" onClick={handleNewClick}>
            <svg width="24" height="24" viewBox="0 0 24 24"><path fill="#EA4335" d="M10 3h4v18h-4z" /><path fill="#FBBC04" d="M3 10h18v4H3z" /><path fill="#4285F4" d="M10 3h4v9h-4z" /><path fill="#34A853" d="M3 10h11v4H3z" /></svg>
            <span>New</span>
          </button>

          <div className="nav-menu">
            <div className={`nav-item ${currentView === 'drive' ? 'active' : ''}`} onClick={() => setCurrentView('drive')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 2H5c-1.11 0-2 .9-2 2v16c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 15l-5-5h3V8h4v4h3l-5 5z" /></svg>
              My Drive
            </div>
            <div className={`nav-item ${currentView === 'settings' ? 'active' : ''}`} onClick={() => setCurrentView('settings')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.73 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .43-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.49-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
              </svg>
              Settings
            </div>
          </div>

          <div className="sidebar-footer-card">
            {isLoading ? (
              <div className="storage-section">
                <div style={{ marginTop: '12px' }}>
                  <div className="skeleton skeleton-text"></div>
                </div>
              </div>
            ) : (
              <div className="storage-section">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--md-sys-color-on-surface-variant)">
                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                  </svg>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--md-sys-color-on-surface)' }}>Storage</div>
                </div>
                
                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '6px' }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--md-sys-color-on-surface)' }}>
                      {formatBytes(quota?.totalUsage || 0)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-on-surface-variant)', fontWeight: 500 }}>
                      {formatBytes(quota?.totalLimit || 0)}
                    </div>
                  </div>
                  <div className="storage-meter">
                    <div className="storage-meter-fill" style={{ width: `${Math.min(100, Math.max(0, getStoragePercentage()))}%`, minWidth: getStoragePercentage() > 0 ? '4px' : '0' }}></div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--md-sys-color-on-surface-variant)', fontWeight: 500, marginTop: '4px' }}>
                    {getStoragePercentage().toFixed(2)}% used
                  </div>
                </div>
                
                <button className="btn-outline" style={{ marginTop: '16px', width: '100%', borderRadius: '100px', padding: '10px 16px', fontSize: '0.9rem', fontWeight: 500 }} onClick={() => setIsAccountsModalOpen(true)}>
                  Manage Accounts
                </button>
              </div>
            )}
            
            <div className="sidebar-divider"></div>
            
            <div style={{ paddingBottom: '4px' }}>
              <h4 style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Connected Accounts</h4>

              <div className="avatar-stack" onClick={() => setIsAccountsModalOpen(true)} style={{ cursor: 'pointer' }}>
                {(quota && quota.accounts ? quota.accounts : accounts).slice(0, 3).map((acc: any) => (
                  <div key={acc.id || acc.email} className="avatar-stack-item">
                    {acc.photoLink ? (
                      <img src={acc.photoLink} alt={acc.email} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                    ) : (
                      <div style={{ background: 'var(--md-sys-color-primary)', color: 'white', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>
                        {acc.email.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                ))}
                {(quota?.accounts?.length || accounts.length) > 3 && (
                  <div className="avatar-stack-item avatar-stack-more">
                    +{(quota?.accounts?.length || accounts.length) - 3}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          className={`main-content ${dragActive ? 'drag-over' : ''}`}
          onDragEnter={currentView === 'drive' ? handleDrag : undefined}
          onDragLeave={currentView === 'drive' ? handleDrag : undefined}
          onDragOver={currentView === 'drive' ? handleDrag : undefined}
          onDrop={currentView === 'drive' ? handleDrop : undefined}
        >
          {currentView === 'settings' ? (
            <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
                <h2 className="page-title" style={{ margin: 0 }}>Settings</h2>
              </div>

              <div style={{ background: 'var(--md-sys-color-surface)', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div className="settings-row" style={{ padding: '20px 0' }}>
                  <div>
                    <div className="settings-label" style={{ fontSize: '1.1rem' }}>Theme</div>
                    <div className="settings-desc">Choose your preferred appearance</div>
                  </div>
                  <select
                    className="settings-select"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                  >
                    <option value="device">Device default</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>

                <div className="settings-row" style={{ padding: '20px 0' }}>
                  <div>
                    <div className="settings-label" style={{ fontSize: '1.1rem' }}>Privacy Mode</div>
                    <div className="settings-desc">Blur files to protect privacy when screen sharing. Hover over a file to reveal it.</div>
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={privacyMode} onChange={(e) => setPrivacyMode(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <>
              {isUploading && (
                <div style={{ background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)', padding: '16px', borderRadius: '12px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 500 }}>
                  <span className="spinner">⏳</span> Uploading items...
                </div>
              )}

              {isLoading && accounts.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '100px' }}>
                  <div className="spinner" style={{ width: '40px', height: '40px', borderTopColor: 'var(--md-sys-color-primary)', borderRightColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: 'transparent', borderWidth: '4px' }}></div>
                </div>
              ) : accounts.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: '100px' }}>
                  <h2 style={{ fontWeight: 400, fontSize: '1.8rem', marginBottom: '16px' }}>A place for all of your files</h2>
                  <button className="btn-new" onClick={loginWithGoogle} style={{ margin: '0 auto', background: 'var(--md-sys-color-surface)', color: 'var(--md-sys-color-on-surface)', border: '1px solid var(--md-sys-color-outline-variant)', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 24px' }}>
                    <svg width="24" height="24" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                      <path d="m6.6 66.85 22.35 11.1c5.8 2.9 12.2.6 15.1-5.2l20.4-38.6" fill="#0066da"/>
                      <path d="m46.5 10.55-21.4 39.5-22.1-11c-5.8-2.9-8.1-9.3-5.2-15.1l21.4-39.5c2.9-5.8 9.3-8.1 15.1-5.2z" fill="#00ac47"/>
                      <path d="m43.5 10.55 22.35 11.1c5.8 2.9 8.1 9.3 5.2 15.1l-20.4 38.6c-2.9 5.8-9.3 8.1-15.1 5.2z" fill="#ea4335"/>
                      <path d="m25.1 50.05 22.1 11c5.8 2.9 12.2.6 15.1-5.2l21.4-39.5c2.9-5.8.6-12.2-5.2-15.1z" fill="#ffba00"/>
                    </svg>
                    <span style={{ fontWeight: 500 }}>Connect Google Drive</span>
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="page-title">My Drive</h2>

                  {isLoading && files.length === 0 ? (
                    <div className="file-grid">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="file-card" style={{ border: 'none', background: 'transparent' }}>
                          <div className="skeleton skeleton-title"></div>
                          <div className="skeleton skeleton-text" style={{ width: '100%', height: '120px' }}></div>
                        </div>
                      ))}
                    </div>
                  ) : files.length === 0 ? (
                    <div style={{ textAlign: 'center', marginTop: '80px', color: 'var(--md-sys-color-on-surface-variant)' }}>
                      <img src="https://ssl.gstatic.com/docs/doclist/images/empty_state_my_drive_v2.svg" alt="Empty Drive" style={{ opacity: 0.6, width: '250px', marginBottom: '24px' }} />
                      <p>Drag files here or use the "New" button to upload.</p>
                    </div>
                  ) : filteredFiles.length === 0 ? (
                    <div style={{ textAlign: 'center', marginTop: '80px', color: 'var(--md-sys-color-on-surface-variant)' }}>
                      <p>No files match "{searchQuery}"</p>
                    </div>
                  ) : (
                    <div className="file-grid">
                      {filteredFiles.map(file => (
                        <div key={file.id} className="file-card" onClick={() => setSelectedPreviewFile(file)}>
                          <div className="file-card-header">
                            {file.iconLink ? (
                              <img src={file.iconLink} alt="Icon" width="24" height="24" referrerPolicy="no-referrer" />
                            ) : (
                              <svg width="24" height="24" viewBox="0 0 24 24" fill={file.mimeType.includes('pdf') ? '#EA4335' : file.mimeType.startsWith('image/') ? '#34A853' : file.mimeType.startsWith('video/') ? '#FBBC04' : '#4285F4'}>
                                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                              </svg>
                            )}
                            <div className="file-card-name" title={file.name}>{file.name}</div>
                          </div>
                          <div className="file-card-body" style={{ padding: (file.hasThumbnail && file.thumbnailLink) ? '0' : '24px' }}>
                            {file.hasThumbnail && file.thumbnailLink ? (
                              <img src={file.thumbnailLink} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                            ) : (
                              <div style={{ fontSize: '48px' }}>
                                {file.mimeType.startsWith('image/') ? '🖼️' : file.mimeType.includes('pdf') ? '📕' : file.mimeType.startsWith('video/') ? '🎥' : '📄'}
                              </div>
                            )}
                          </div>
                          <div className="file-card-footer">
                            <div className="file-card-meta">
                              <span style={{ fontSize: '0.85rem', color: 'var(--md-sys-color-on-surface-variant)' }}>{formatBytes(parseInt(file.size || '0'))}</span>
                              <span className="file-card-account">{file.accountEmail}</span>
                            </div>
                            <button className="icon-button" onClick={(e) => { e.stopPropagation(); window.open(`${API_URL}/drive/download/${file.accountId}/${file.id}`, '_blank'); }} title="Download">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
      </div>

      {/* Connected Accounts Modal */}
      {isAccountsModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAccountsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Connected Accounts</h2>
              <button className="modal-close" onClick={() => setIsAccountsModalOpen(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(quota && quota.accounts ? quota.accounts : accounts).map((acc: any) => (
                <div key={acc.id || acc.email} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#F8F9FA', border: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {acc.photoLink ? (
                      <img src={acc.photoLink} alt={acc.email} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                    ) : (
                      <div style={{ background: 'var(--md-sys-color-primary)', color: 'white', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold' }}>
                        {acc.email.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '1rem', color: 'var(--md-sys-color-on-surface)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={acc.email}>
                      {acc.email}
                    </div>
                    {acc.usage && acc.limit && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-on-surface-variant)', marginTop: '2px' }}>
                        {formatBytes(acc.usage)} / {formatBytes(acc.limit)} used
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <button
                className="btn-outline"
                style={{ marginTop: '12px', width: '100%', justifyContent: 'center', padding: '12px' }}
                onClick={() => { setIsAccountsModalOpen(false); loginWithGoogle(); }}
              >
                + Connect Another Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {selectedPreviewFile && (
        <div className="modal-overlay" onClick={() => setSelectedPreviewFile(null)}>
          <div className="modal-preview-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: '1.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '16px' }}>{selectedPreviewFile.name}</h2>
              <button className="modal-close" onClick={() => setSelectedPreviewFile(null)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
              </button>
            </div>

            {selectedPreviewFile.mimeType === 'application/pdf' ? (
              <iframe 
                src={`${API_URL}/drive/download/${selectedPreviewFile.accountId}/${selectedPreviewFile.id}?inline=true`} 
                className="modal-preview-image"
                style={{ width: '100%', height: '70vh', border: 'none', background: 'white' }}
                title={selectedPreviewFile.name}
              />
            ) : selectedPreviewFile.hasThumbnail && selectedPreviewFile.thumbnailLink ? (
              <img
                src={selectedPreviewFile.thumbnailLink.replace('=s220', '=s1000')}
                alt={selectedPreviewFile.name}
                className="modal-preview-image"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--md-sys-color-background)' }}>
                {selectedPreviewFile.iconLink ? (
                  <img src={selectedPreviewFile.iconLink.replace('16', '128')} alt="Icon" style={{ width: '128px', height: '128px' }} referrerPolicy="no-referrer" />
                ) : (
                  <svg width="128" height="128" viewBox="0 0 24 24" fill="var(--md-sys-color-primary)"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" /></svg>
                )}
              </div>
            )}

            <div className="modal-body" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', background: 'var(--md-sys-color-surface)' }}>
              {selectedPreviewFile.webViewLink && (
                <a href={selectedPreviewFile.webViewLink} target="_blank" rel="noreferrer" className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" /></svg>
                  Open in Drive
                </a>
              )}
              <button
                className="btn-primary"
                onClick={() => { window.open(`${API_URL}/drive/download/${selectedPreviewFile.accountId}/${selectedPreviewFile.id}`, '_blank'); }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
                Download File
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
