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
  const [currentView, setCurrentView] = useState<'drive' | 'settings' | 'starred' | 'analyzer' | 'activity'>('drive');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<{id: string, name: string}[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<any>(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'device');
  const [privacyMode, setPrivacyMode] = useState(localStorage.getItem('privacyMode') === 'true');
  const [searchQuery, setSearchQuery] = useState('');
  const [transferModalFile, setTransferModalFile] = useState<any>(null);
  const [targetAccountId, setTargetAccountId] = useState<string>('');
  const [transferAction, setTransferAction] = useState<'copy' | 'move'>('copy');
  const [isTransferring, setIsTransferring] = useState(false);

  // Batch Operations State
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [isBatchTransferModalOpen, setIsBatchTransferModalOpen] = useState(false);
  const [batchTargetAccountId, setBatchTargetAccountId] = useState<string>('');
  const [batchTransferAction, setBatchTransferAction] = useState<'copy' | 'move'>('copy');
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [filterAccountId, setFilterAccountId] = useState<string>('all');

  const filteredFiles = useMemo(() => {
    let result = files;
    if (filterAccountId !== 'all') {
      result = result.filter(file => file.accountId === filterAccountId || file.accountEmail === filterAccountId);
    }
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(file => file.name.toLowerCase().includes(lowerQuery));
    }
    return result;
  }, [files, searchQuery, filterAccountId]);

  const handleToggleStar = async (file: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const starred = !file.starred;
      await fetch(`${API_URL}/drive/star`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id, accountId: file.accountId, starred })
      });
      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, starred } : f));
      if (currentView === 'starred' && !starred) {
        setFiles(prev => prev.filter(f => f.id !== file.id));
      }
      showToast(starred ? 'Starred file' : 'Unstarred file');
    } catch (e) {
      showToast('Failed to star file', 'error');
    }
  };

  const handleOpenTransfer = (file: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTransferModalFile(file);
    // Auto-select first account that is not the source account
    const availableTargets = (quota?.accounts || accounts).filter((acc: any) => (acc.id || acc.email) !== file.accountId && acc.email !== file.accountEmail);
    if (availableTargets.length > 0) {
      setTargetAccountId(availableTargets[0].id || availableTargets[0].email);
    } else {
      setTargetAccountId('');
    }
  };

  const handleExecuteTransfer = async () => {
    if (!transferModalFile || !targetAccountId) return;
    setIsTransferring(true);
    try {
      const res = await fetch(`${API_URL}/drive/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: transferModalFile.id,
          sourceAccountId: transferModalFile.accountId,
          targetAccountId,
          action: transferAction,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Successfully ${transferAction === 'move' ? 'moved' : 'copied'} "${transferModalFile.name}"`, 'success');
        setTransferModalFile(null);
        fetchData();
      } else {
        showToast(data.error || 'Transfer failed', 'error');
      }
    } catch (err: any) {
      console.error('Transfer error:', err);
      showToast('Network error during transfer', 'error');
    } finally {
      setIsTransferring(false);
    }
  };

  // Batch Helper Handlers
  const toggleSelectFile = (fileId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedFileIds.size === filteredFiles.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(filteredFiles.map(f => f.id)));
    }
  };

  const handleClearSelection = () => {
    setSelectedFileIds(new Set());
  };

  const getSelectedFiles = () => {
    return files.filter(f => selectedFileIds.has(f.id));
  };

  const handleBatchDelete = async () => {
    const selected = getSelectedFiles();
    if (selected.length === 0) return;

    if (!window.confirm(`Are you sure you want to delete ${selected.length} file(s) across connected accounts? This cannot be undone.`)) {
      return;
    }

    setIsBatchProcessing(true);
    try {
      const res = await fetch(`${API_URL}/drive/batch-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: selected.map(f => ({ fileId: f.id, accountId: f.accountId }))
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Successfully deleted ${data.successCount} file(s)`, 'success');
        setSelectedFileIds(new Set());
        fetchData();
      } else {
        showToast(data.error || 'Batch delete failed', 'error');
      }
    } catch (err: any) {
      console.error('Batch delete error:', err);
      showToast('Network error during batch delete', 'error');
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleBatchDownloadZip = async () => {
    const selected = getSelectedFiles();
    if (selected.length === 0) return;

    setIsDownloadingZip(true);
    showToast(`Preparing ZIP export for ${selected.length} file(s)...`, 'success');
    try {
      const res = await fetch(`${API_URL}/drive/batch-download-zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: selected.map(f => ({ fileId: f.id, accountId: f.accountId, name: f.name }))
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate ZIP');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DriveMerge_Export_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('ZIP download completed!', 'success');
    } catch (err: any) {
      console.error('Batch download error:', err);
      showToast(err?.message || 'Failed to download ZIP', 'error');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleOpenBatchTransfer = () => {
    const selected = getSelectedFiles();
    if (selected.length === 0) return;

    // Pick a default target account
    const accountsList = quota?.accounts || accounts;
    if (accountsList.length > 0) {
      setBatchTargetAccountId(accountsList[0].id || accountsList[0].email);
    }
    setIsBatchTransferModalOpen(true);
  };

  const handleExecuteBatchTransfer = async () => {
    const selected = getSelectedFiles();
    if (selected.length === 0 || !batchTargetAccountId) return;

    setIsBatchProcessing(true);
    try {
      const res = await fetch(`${API_URL}/drive/batch-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: selected.map(f => ({ fileId: f.id, sourceAccountId: f.accountId, name: f.name })),
          targetAccountId: batchTargetAccountId,
          action: batchTransferAction
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Successfully ${batchTransferAction === 'move' ? 'moved' : 'copied'} ${data.successCount} file(s)`, 'success');
        setIsBatchTransferModalOpen(false);
        setSelectedFileIds(new Set());
        fetchData();
      } else {
        showToast(data.error || 'Batch transfer failed', 'error');
      }
    } catch (err: any) {
      console.error('Batch transfer error:', err);
      showToast('Network error during batch transfer', 'error');
    } finally {
      setIsBatchProcessing(false);
    }
  };

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
  }, [currentFolderId, currentView]);

  useEffect(() => {
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
        let url = `${API_URL}/drive/files`;
        const params = new URLSearchParams();
        if (currentFolderId && currentView === 'drive') params.append('folderId', currentFolderId);
        if (currentView === 'starred') params.append('starred', 'true');
        if (params.toString()) url += '?' + params.toString();

        const fetchPromises: any = [
          fetch(`${API_URL}/drive/quota`),
          fetch(url)
        ];
        if (currentView === 'activity') {
          fetchPromises.push(fetch(`${API_URL}/drive/activity-logs`));
        }

        const resArr = await Promise.all(fetchPromises);
        setQuota(await resArr[0].json());
        const data = await resArr[1].json();
        setFiles(data.files || []);
        if (resArr[2]) {
          const logsData = await resArr[2].json();
          setActivityLogs(logsData.logs || []);
        }
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
          <select 
            className="settings-select" 
            style={{ padding: '6px 12px', fontSize: '0.85rem', width: 'auto', borderRadius: '20px' }}
            value={filterAccountId}
            onChange={(e) => setFilterAccountId(e.target.value)}
          >
            <option value="all">All Accounts</option>
            {(quota?.accounts || accounts).map((acc: any) => (
              <option key={acc.id || acc.email} value={acc.id || acc.email}>{acc.email}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="body-layout">
        <div className="sidebar">
          {accounts.length > 0 && (
            <button className="btn-new" onClick={handleNewClick}>
              <svg width="24" height="24" viewBox="0 0 24 24"><path fill="#EA4335" d="M10 3h4v18h-4z" /><path fill="#FBBC04" d="M3 10h18v4H3z" /><path fill="#4285F4" d="M10 3h4v9h-4z" /><path fill="#34A853" d="M3 10h11v4H3z" /></svg>
              <span>New</span>
            </button>
          )}

          <div className="nav-menu">
            <div className={`nav-item ${currentView === 'drive' ? 'active' : ''}`} onClick={() => { setCurrentView('drive'); setCurrentFolderId(null); setFolderPath([]); }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 2H5c-1.11 0-2 .9-2 2v16c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 15l-5-5h3V8h4v4h3l-5 5z" /></svg>
              My Drive
            </div>
            <div className={`nav-item ${currentView === 'starred' ? 'active' : ''}`} onClick={() => { setCurrentView('starred'); setCurrentFolderId(null); setFolderPath([]); }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
              Starred
            </div>
            <div className={`nav-item ${currentView === 'analyzer' ? 'active' : ''}`} onClick={() => setCurrentView('analyzer')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z"/></svg>
              Storage Analyzer
            </div>
            <div className={`nav-item ${currentView === 'activity' ? 'active' : ''}`} onClick={() => setCurrentView('activity')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
              Activity Log
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
          {currentView === 'analyzer' ? (
            <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 className="page-title" style={{ margin: 0 }}>Storage Analyzer (Top 50 Largest)</h2>
                <button className="btn-outline" onClick={async () => {
                  if (window.confirm("Empty trash across all accounts? This cannot be undone.")) {
                    setIsLoading(true);
                    await fetch(`${API_URL}/drive/empty-trash`, { method: 'POST' });
                    fetchData();
                  }
                }} style={{ color: '#EA4335', borderColor: '#EA4335', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                  Empty All Trash
                </button>
              </div>
              <div className="file-grid">
                {[...files].sort((a, b) => parseInt(b.size || '0') - parseInt(a.size || '0')).slice(0, 50).map(file => (
                  <div key={file.id} className="file-card">
                    <div className="file-card-header">
                      <div className="file-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg></div>
                      <div className="file-name" title={file.name}>{file.name}</div>
                    </div>
                    <div className="file-card-meta">
                      <span style={{ fontSize: '0.85rem', color: 'var(--md-sys-color-on-surface-variant)' }}>{formatBytes(parseInt(file.size || '0'))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : currentView === 'activity' ? (
            <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
              <h2 className="page-title" style={{ marginBottom: '24px' }}>Activity Log</h2>
              <div style={{ background: 'var(--md-sys-color-surface)', borderRadius: '16px', padding: '24px' }}>
                {activityLogs.map((log: any) => (
                  <div key={log.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
                    <div style={{ fontWeight: 600 }}>{log.action}</div>
                    <div style={{ fontSize: '0.9rem' }}>{log.fileName || log.details}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-on-surface-variant)' }}>{new Date(log.createdAt).toLocaleString()} - {log.googleAccount?.email || 'System'}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : currentView === 'settings' ? (
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
                    <img src="/Google_Drive_Logo.svg" alt="Google Drive" width="24" height="24" style={{ objectFit: 'contain' }} />
                    <span style={{ fontWeight: 500 }}>Connect Google Drive</span>
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 className="page-title" style={{ margin: 0 }}>
                      {currentView === 'drive' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ cursor: 'pointer', color: currentFolderId ? 'var(--md-sys-color-primary)' : 'inherit' }} onClick={() => { setCurrentFolderId(null); setFolderPath([]); }}>My Drive</span>
                          {folderPath.map((f, i) => (
                            <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--md-sys-color-on-surface-variant)"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                              <span 
                                style={{ cursor: 'pointer', color: i === folderPath.length - 1 ? 'inherit' : 'var(--md-sys-color-primary)' }}
                                onClick={() => {
                                  setCurrentFolderId(f.id);
                                  setFolderPath(folderPath.slice(0, i + 1));
                                }}
                              >
                                {f.name}
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : currentView === 'starred' ? 'Starred' : currentView === 'analyzer' ? 'Storage Analyzer' : currentView === 'activity' ? 'Activity Log' : 'My Drive'}
                    </h2>
                    {filteredFiles.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                          className="btn-outline"
                          onClick={handleSelectAll}
                          style={{ padding: '6px 14px', fontSize: '0.85rem', borderRadius: '20px' }}
                        >
                          {selectedFileIds.size === filteredFiles.length ? 'Deselect All' : 'Select All'}
                        </button>
                        {selectedFileIds.size > 0 && (
                          <>
                            <span style={{ fontSize: '0.85rem', color: 'var(--md-sys-color-primary)', fontWeight: 500 }}>
                              {selectedFileIds.size} selected
                            </span>
                            <div style={{ display: 'flex', gap: '8px', marginLeft: '12px' }}>
                              {(quota?.accounts || accounts).length > 1 && (
                                <button className="btn-outline" onClick={handleOpenBatchTransfer} disabled={isBatchProcessing} style={{ padding: '6px 14px', fontSize: '0.85rem', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg>
                                  Transfer
                                </button>
                              )}
                              <button className="btn-outline" onClick={handleBatchDownloadZip} disabled={isDownloadingZip || isBatchProcessing} style={{ padding: '6px 14px', fontSize: '0.85rem', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
                                {isDownloadingZip ? 'Zipping...' : 'Download'}
                              </button>
                              <button className="btn-outline" onClick={handleBatchDelete} disabled={isBatchProcessing} style={{ padding: '6px 14px', fontSize: '0.85rem', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', color: '#EA4335', borderColor: '#EA4335' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

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
                    <div className={`file-grid ${selectedFileIds.size > 0 ? 'batch-active' : ''}`}>
                      {filteredFiles.map(file => {
                        const isSelected = selectedFileIds.has(file.id);
                        return (
                        <div
                          key={file.id}
                          className={`file-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedPreviewFile(file)}
                          onDoubleClick={() => {
                            if (file.mimeType === 'application/vnd.google-apps.folder') {
                              setCurrentFolderId(file.id);
                              setFolderPath([...folderPath, { id: file.id, name: file.name }]);
                              setSelectedPreviewFile(null);
                            }
                          }}
                        >
                          {/* Selection Checkbox */}
                          <div
                            className="file-card-checkbox-wrapper"
                            onClick={(e) => toggleSelectFile(file.id, e)}
                            title={isSelected ? 'Deselect' : 'Select'}
                          >
                            <input
                              type="checkbox"
                              className="file-card-checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--md-sys-color-surface-container-high)', padding: '2px 8px 2px 2px', borderRadius: '12px' }} title={file.accountEmail}>
                                {(() => {
                                  const acc = (quota?.accounts || accounts).find((a: any) => a.id === file.accountId || a.email === file.accountEmail);
                                  if (acc?.photoLink) {
                                    return <img src={acc.photoLink} alt="Avatar" style={{ width: '18px', height: '18px', borderRadius: '50%' }} referrerPolicy="no-referrer" />;
                                  }
                                  return (
                                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'var(--md-sys-color-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>
                                      {file.accountEmail.charAt(0).toUpperCase()}
                                    </div>
                                  );
                                })()}
                                <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--md-sys-color-on-surface)', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {file.accountEmail.split('@')[0]}
                                </span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                className="icon-button"
                                onClick={(e) => handleToggleStar(file, e)}
                                title={file.starred ? "Unstar" : "Star"}
                                style={{ color: file.starred ? '#F4B400' : 'var(--md-sys-color-on-surface-variant)' }}
                              >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                  {file.starred ? <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/> : <path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"/>}
                                </svg>
                              </button>
                              {(quota?.accounts || accounts).length > 1 && (
                                <button
                                  className="icon-button"
                                  onClick={(e) => handleOpenTransfer(file, e)}
                                  title="Transfer across drives (Copy / Move)"
                                  style={{ color: 'var(--md-sys-color-primary)' }}
                                >
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/>
                                  </svg>
                                </button>
                              )}
                              <button className="icon-button" onClick={(e) => { e.stopPropagation(); window.open(`${API_URL}/drive/download/${file.accountId}/${file.id}`, '_blank'); }} title="Download">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
                              </button>
                            </div>
                          </div>
                        </div>
                        );
                      })}
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

            {selectedPreviewFile.mimeType === 'application/pdf' || selectedPreviewFile.mimeType.startsWith('text/') || selectedPreviewFile.mimeType.includes('json') || selectedPreviewFile.mimeType.includes('javascript') || selectedPreviewFile.mimeType.includes('csv') ? (
              <iframe 
                src={`${API_URL}/drive/download/${selectedPreviewFile.accountId}/${selectedPreviewFile.id}?inline=true`} 
                className="modal-preview-image"
                style={{ width: '100%', height: '70vh', border: 'none', background: 'white' }}
                title={selectedPreviewFile.name}
              />
            ) : selectedPreviewFile.mimeType.startsWith('video/') ? (
              <video 
                controls 
                src={`${API_URL}/drive/download/${selectedPreviewFile.accountId}/${selectedPreviewFile.id}`} 
                className="modal-preview-image"
                style={{ width: '100%', maxHeight: '70vh', background: 'black' }}
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
              {(quota?.accounts || accounts).length > 1 && (
                <button
                  className="btn-outline"
                  onClick={() => {
                    const file = selectedPreviewFile;
                    setSelectedPreviewFile(null);
                    handleOpenTransfer(file);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/>
                  </svg>
                  Transfer File
                </button>
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

      {/* Cross-Account Transfer Modal */}
      {transferModalFile && (
        <div className="modal-overlay" onClick={() => !isTransferring && setTransferModalFile(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Transfer File Across Drives</h2>
              <button className="modal-close" disabled={isTransferring} onClick={() => setTransferModalFile(null)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
              </button>
            </div>

            <div className="modal-body">
              {/* Selected File Summary */}
              <div style={{
                background: 'var(--md-sys-color-surface-container-low)',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                border: '1px solid var(--md-sys-color-outline-variant)'
              }}>
                <div style={{ fontSize: '28px' }}>
                  {transferModalFile.mimeType?.startsWith('image/') ? '🖼️' : transferModalFile.mimeType?.includes('pdf') ? '📕' : transferModalFile.mimeType?.startsWith('video/') ? '🎥' : '📄'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={transferModalFile.name}>
                    {transferModalFile.name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-on-surface-variant)', marginTop: '2px' }}>
                    From: <strong>{transferModalFile.accountEmail}</strong> ({formatBytes(parseInt(transferModalFile.size || '0'))})
                  </div>
                </div>
              </div>

              {/* Action Toggle (Copy vs Move) */}
              <div style={{ fontWeight: 500, fontSize: '0.9rem', marginBottom: '8px' }}>Select Action:</div>
              <div className="transfer-action-options">
                <button
                  type="button"
                  className={`transfer-action-btn ${transferAction === 'copy' ? 'active' : ''}`}
                  onClick={() => setTransferAction('copy')}
                  disabled={isTransferring}
                >
                  <span style={{ fontSize: '20px' }}>📑</span>
                  <span>Copy (Keep both)</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Duplicate to destination</span>
                </button>
                <button
                  type="button"
                  className={`transfer-action-btn ${transferAction === 'move' ? 'active' : ''}`}
                  onClick={() => setTransferAction('move')}
                  disabled={isTransferring}
                >
                  <span style={{ fontSize: '20px' }}>📦</span>
                  <span>Move (Delete source)</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Transfer & free source space</span>
                </button>
              </div>

              {/* Target Account Selection */}
              <div style={{ fontWeight: 500, fontSize: '0.9rem', marginTop: '16px', marginBottom: '8px' }}>
                Select Destination Account:
              </div>
              <div className="target-account-list">
                {(quota?.accounts || accounts)
                  .filter((acc: any) => (acc.id || acc.email) !== transferModalFile.accountId && acc.email !== transferModalFile.accountEmail)
                  .map((acc: any) => {
                    const accId = acc.id || acc.email;
                    const isSelected = targetAccountId === accId;
                    return (
                      <div
                        key={accId}
                        className={`target-account-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => !isTransferring && setTargetAccountId(accId)}
                      >
                        <input
                          type="radio"
                          name="targetAccount"
                          checked={isSelected}
                          onChange={() => setTargetAccountId(accId)}
                          disabled={isTransferring}
                          style={{ accentColor: 'var(--md-sys-color-primary)', width: '18px', height: '18px' }}
                        />
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#F0F4F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {acc.photoLink ? (
                            <img src={acc.photoLink} alt={acc.email} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                          ) : (
                            <span style={{ fontWeight: 'bold', color: 'var(--md-sys-color-primary)' }}>{acc.email.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {acc.email}
                          </div>
                          {acc.usage && acc.limit && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--md-sys-color-on-surface-variant)' }}>
                              Available: {formatBytes(parseInt(acc.limit) - parseInt(acc.usage))} free
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Progress or Actions */}
              <div style={{ marginTop: '20px', display: 'flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-outline"
                  disabled={isTransferring}
                  onClick={() => setTransferModalFile(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={isTransferring || !targetAccountId}
                  onClick={handleExecuteTransfer}
                  style={{ minWidth: '130px', justifyContent: 'center' }}
                >
                  {isTransferring ? (
                    <>
                      <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></span>
                      Transferring...
                    </>
                  ) : (
                    transferAction === 'move' ? 'Move File' : 'Copy File'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Transfer Modal */}
      {isBatchTransferModalOpen && (
        <div className="modal-overlay" onClick={() => !isBatchProcessing && setIsBatchTransferModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Batch Transfer Files</h2>
              <button className="modal-close" disabled={isBatchProcessing} onClick={() => setIsBatchTransferModalOpen(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
              </button>
            </div>

            <div className="modal-body">
              <div style={{
                background: 'var(--md-sys-color-surface-container-low)',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '16px',
                border: '1px solid var(--md-sys-color-outline-variant)'
              }}>
                <div style={{ fontWeight: 600 }}>{selectedFileIds.size} files selected</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-on-surface-variant)', marginTop: '2px' }}>
                  Choose destination account and action.
                </div>
              </div>

              {/* Action Toggle */}
              <div style={{ fontWeight: 500, fontSize: '0.9rem', marginBottom: '8px' }}>Select Action:</div>
              <div className="transfer-action-options">
                <button
                  type="button"
                  className={`transfer-action-btn ${batchTransferAction === 'copy' ? 'active' : ''}`}
                  onClick={() => setBatchTransferAction('copy')}
                  disabled={isBatchProcessing}
                >
                  <span style={{ fontSize: '20px' }}>📑</span>
                  <span>Copy (Keep both)</span>
                </button>
                <button
                  type="button"
                  className={`transfer-action-btn ${batchTransferAction === 'move' ? 'active' : ''}`}
                  onClick={() => setBatchTransferAction('move')}
                  disabled={isBatchProcessing}
                >
                  <span style={{ fontSize: '20px' }}>📦</span>
                  <span>Move (Delete source)</span>
                </button>
              </div>

              {/* Target Account Selection */}
              <div style={{ fontWeight: 500, fontSize: '0.9rem', marginTop: '16px', marginBottom: '8px' }}>
                Select Destination Account:
              </div>
              <div className="target-account-list">
                {(quota?.accounts || accounts).map((acc: any) => {
                  const accId = acc.id || acc.email;
                  const isSelected = batchTargetAccountId === accId;
                  return (
                    <div
                      key={accId}
                      className={`target-account-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => !isBatchProcessing && setBatchTargetAccountId(accId)}
                    >
                      <input
                        type="radio"
                        name="batchTargetAccount"
                        checked={isSelected}
                        onChange={() => setBatchTargetAccountId(accId)}
                        disabled={isBatchProcessing}
                        style={{ accentColor: 'var(--md-sys-color-primary)', width: '18px', height: '18px' }}
                      />
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#F0F4F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {acc.photoLink ? (
                          <img src={acc.photoLink} alt={acc.email} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                        ) : (
                          <span style={{ fontWeight: 'bold', color: 'var(--md-sys-color-primary)' }}>{acc.email.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {acc.email}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: '20px', display: 'flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-outline"
                  disabled={isBatchProcessing}
                  onClick={() => setIsBatchTransferModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={isBatchProcessing || !batchTargetAccountId}
                  onClick={handleExecuteBatchTransfer}
                  style={{ minWidth: '130px', justifyContent: 'center' }}
                >
                  {isBatchProcessing ? (
                    <>
                      <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></span>
                      Processing...
                    </>
                  ) : (
                    batchTransferAction === 'move' ? 'Move Files' : 'Copy Files'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
