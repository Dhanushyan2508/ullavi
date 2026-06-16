import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { classifyPhone } from '../utils/classifyPhone';
import { classifyEmail } from '../utils/classifyEmail';

function RippleButton({ children, className, onClick, ...props }) {
  const createRipple = (event) => {
    const button = event.currentTarget;
    const circle = document.createElement("span");
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - button.offsetLeft - radius}px`;
    circle.style.top = `${event.clientY - button.offsetTop - radius}px`;
    circle.classList.add("ripple");
    const ripple = button.getElementsByClassName("ripple")[0];
    if (ripple) ripple.remove();
    button.appendChild(circle);
    if (onClick) onClick(event);
  };
  return <button className={className} onClick={createRipple} {...props}>{children}</button>;
}

export default function FoldersScreen({
  contacts,
  folders,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onDeleteContact,
  onUpdateContact,
  onRetryDispatch
}) {
  const [activeFolderId, setActiveFolderId] = useState(null); // null means showing folders list
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [editingFolder, setEditingFolder] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  
  const addToast = useToast();

  // Helper to get contact count in each folder
  const getContactCount = (folderId) => {
    return contacts.filter(c => {
      if (folderId === 'uncategorized') {
        return !c.folderId || c.folderId === 'uncategorized';
      }
      return c.folderId === folderId;
    }).length;
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!folderNameInput.trim()) {
      addToast('Folder name cannot be empty', 'error');
      return;
    }
    onCreateFolder(folderNameInput.trim());
    setFolderNameInput('');
    setShowCreateModal(false);
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (!folderNameInput.trim()) {
      addToast('Folder name cannot be empty', 'error');
      return;
    }
    onUpdateFolder(editingFolder.id, folderNameInput.trim());
    setFolderNameInput('');
    setEditingFolder(null);
    setShowEditModal(false);
  };

  const handleDeleteClick = (folder, e) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete the folder "${folder.name}"? Contacts inside this folder will be moved to Uncategorized.`)) {
      onDeleteFolder(folder.id);
    }
  };

  // Contacts inside active folder
  const activeFolderContacts = activeFolderId
    ? contacts.filter(c => {
        if (activeFolderId === 'uncategorized') {
          return !c.folderId || c.folderId === 'uncategorized';
        }
        return c.folderId === activeFolderId;
      })
    : [];

  const activeFolderName = activeFolderId === 'uncategorized'
    ? 'Uncategorized'
    : folders.find(f => f.id === activeFolderId)?.name || '';

  const StatusBadge = ({ status }) => {
    if (status === 'sent' || status === 'synced') return <span className="badge badge-success status-sent"><span className="material-icons" style={{ fontSize: 12, marginRight: 4 }}>check_circle</span>{status === 'synced' ? 'Synced' : 'Sent'}</span>;
    if (status === 'queued') return <span className="badge badge-warning status-pending"><span className="material-icons" style={{ fontSize: 12, marginRight: 4 }}>schedule</span>Queued</span>;
    if (status === 'failed') return <span className="badge badge-danger"><span className="material-icons" style={{ fontSize: 12, marginRight: 4 }}>error</span>Failed</span>;
    return null;
  };

  const SyncStatusBadge = ({ syncStatus }) => {
    if (syncStatus === 'pending') {
      return (
        <span className="badge badge-warning" style={{ fontSize: 9, background: 'rgba(217, 119, 6, 0.1)', color: '#D97706', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <span className="material-icons syncing-icon" style={{ fontSize: 10 }}>sync</span>
          Sync Pending
        </span>
      );
    }
    return null;
  };

  // If showing contacts in folder
  if (activeFolderId !== null) {
    return (
      <div className="page-content" style={{ animation: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => setActiveFolderId(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--primary)', padding: 0 }}
          >
            <span className="material-icons" style={{ fontSize: 28 }}>arrow_back</span>
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-icons" style={{ color: 'var(--primary)' }}>
                {activeFolderId === 'uncategorized' ? 'folder_open' : 'folder'}
              </span>
              {activeFolderName}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
              {activeFolderContacts.length} contact{activeFolderContacts.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {activeFolderContacts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0', opacity: 0.5 }}>
            <span className="material-icons" style={{ fontSize: 64, marginBottom: 16 }}>folder_open</span>
            <p>No contacts in this folder</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activeFolderContacts.map(c => (
              <div
                key={c.id}
                className="card"
                style={{ padding: 16, cursor: 'pointer' }}
                onClick={() => setSelectedContact(c)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', background: c.avatarColor || 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, flexShrink: 0 }}>
                    {c.previewUrl ? (
                      <img src={c.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Card thumbnail" />
                    ) : (
                      c.name ? c.name[0] : '?'
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{c.name}</span>
                      <SyncStatusBadge syncStatus={c.syncStatus} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{c.company}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <StatusBadge status={c.whatsappStatus} />
                      <StatusBadge status={c.emailStatus} />
                      {c.zohoStatus && <StatusBadge status={c.zohoStatus} />}
                    </div>
                  </div>
                  <span className="material-icons" style={{ color: 'var(--border)' }}>chevron_right</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedContact && (
          <div className="modal-overlay" onClick={() => setSelectedContact(null)} style={{ zIndex: 1000 }}>
            <div className="modal-sheet" onClick={e => e.stopPropagation()}>
              <div style={{ width: 40, height: 4, background: '#E2E8F0', borderRadius: 2, margin: '0 auto 20px' }} />
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', background: selectedContact.avatarColor || 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 24, flexShrink: 0 }}>
                  {selectedContact.previewUrl ? (
                    <img src={selectedContact.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Card avatar" />
                  ) : (
                    selectedContact.name ? selectedContact.name[0] : '?'
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>{selectedContact.name}</span>
                    <SyncStatusBadge syncStatus={selectedContact.syncStatus} />
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>{selectedContact.company}</div>
                </div>
              </div>

              <div style={{ background: 'var(--background)', borderRadius: 16, padding: 16, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '240px', overflowY: 'auto' }}>
                {(() => {
                  const contactEmails = selectedContact.emails && selectedContact.emails.length > 0
                    ? selectedContact.emails
                    : [selectedContact.email, selectedContact.altEmail].filter(Boolean);
                  
                  return contactEmails.map((email, eIdx) => {
                    const isPrimary = email === selectedContact.email;
                    const type = classifyEmail(email);
                    const badgeColors = {
                      Personal: { background: 'rgba(22, 163, 74, 0.1)', color: '#16A34A' },
                      Sales: { background: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary)' },
                      Support: { background: 'rgba(217, 119, 6, 0.1)', color: '#D97706' },
                      Admin: { background: 'rgba(220, 38, 38, 0.1)', color: '#DC2626' },
                    };
                    const currentBadge = badgeColors[type] || badgeColors.Personal;

                    return (
                      <div key={`email-${eIdx}`} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 0 }}>
                          <span className="material-icons" style={{ color: isPrimary ? 'var(--primary)' : 'var(--text-secondary)', fontSize: 20, flexShrink: 0 }}>
                            {isPrimary ? 'email' : 'alternate_email'}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: isPrimary ? 600 : 400, wordBreak: 'break-all', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</span>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, flexShrink: 0, ...currentBadge }}>
                          {type}
                        </span>
                      </div>
                    );
                  });
                })()}

                {(() => {
                  const contactPhones = selectedContact.phones && selectedContact.phones.length > 0
                    ? selectedContact.phones
                    : [selectedContact.phone, selectedContact.altPhone].filter(Boolean);

                  return contactPhones.map((phone, pIdx) => {
                    const isPrimary = phone === selectedContact.phone;
                    const type = classifyPhone(phone, selectedContact.ocrLines || []);
                    const badgeColors = {
                      Mobile: { background: 'rgba(22, 163, 74, 0.1)', color: '#16A34A' },
                      Office: { background: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary)' },
                      Landline: { background: 'rgba(100, 116, 139, 0.1)', color: '#64748B' },
                      Fax: { background: 'rgba(220, 38, 38, 0.1)', color: '#DC2626' },
                    };
                    const currentBadge = badgeColors[type] || badgeColors.Mobile;

                    return (
                      <div key={`phone-${pIdx}`} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 0 }}>
                          <span className="material-icons" style={{ color: isPrimary ? 'var(--primary)' : 'var(--text-secondary)', fontSize: 20, flexShrink: 0 }}>
                            {isPrimary ? 'phone' : 'contact_phone'}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: isPrimary ? 600 : 400, wordBreak: 'break-all' }}>{phone}</span>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, flexShrink: 0, ...currentBadge }}>
                          {type}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Notes / Remarks Display & Edit */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-icons" style={{ fontSize: 14 }}>notes</span> 📝 Notes / Remarks
                  </span>
                </div>
                <textarea
                  className="form-input"
                  style={{ fontSize: 13, minHeight: 80, padding: 8, resize: 'vertical' }}
                  defaultValue={selectedContact.notes || ''}
                  placeholder="Add remarks, congratulations, follow-up details, or personalized messages..."
                  maxLength={5000}
                  onBlur={async (e) => {
                    const val = e.target.value.trim();
                    if (val !== (selectedContact.notes || '')) {
                      const updated = { ...selectedContact, notes: val, updatedAt: new Date().toISOString() };
                      setSelectedContact(updated);
                      await onUpdateContact(updated);
                      addToast('Notes / Remarks updated', 'success');
                    }
                  }}
                />
              </div>

              {selectedContact.previewUrl && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8, letterSpacing: '0.05em' }}>Scanned Card Image</div>
                  <div style={{ width: '100%', height: 160, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <img src={selectedContact.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#f1f5f9' }} alt="Scanned card" />
                  </div>
                </div>
              )}

              {((selectedContact.whatsappStatus && selectedContact.whatsappStatus !== 'sent') || 
                (selectedContact.emailStatus && selectedContact.emailStatus !== 'sent') || 
                (selectedContact.zohoStatus && selectedContact.zohoStatus !== 'synced')) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'var(--warning-light)', borderRadius: 12, marginBottom: 20, border: '1px solid #fde68a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>Delivery Status</span>
                    <button 
                      className="btn btn-primary" 
                      style={{ padding: '6px 12px', fontSize: 12, borderRadius: 8 }}
                      onClick={() => {
                        if (onRetryDispatch) {
                          onRetryDispatch(selectedContact);
                          setSelectedContact(null);
                        }
                      }}
                    >
                      <span className="material-icons" style={{ fontSize: 14 }}>sync</span> Retry Send
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <RippleButton className="btn btn-outline" style={{ flex: 1 }} onClick={() => setSelectedContact(null)}>Close</RippleButton>
                <RippleButton className="btn btn-danger" style={{ flex: 1 }} onClick={() => { onDeleteContact(selectedContact.id); setSelectedContact(null); }}>Delete</RippleButton>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Display Folders List
  return (
    <div className="page-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Folders</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Organize your contacts by event.</p>
        </div>
        <RippleButton
          className="btn btn-primary"
          style={{ padding: '10px 16px', borderRadius: 12, fontSize: 13 }}
          onClick={() => {
            setFolderNameInput('');
            setShowCreateModal(true);
          }}
        >
          <span className="material-icons" style={{ fontSize: 18 }}>add</span>
          New Folder
        </RippleButton>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Render folders list */}
        {folders.map(folder => (
          <div
            key={folder.id}
            className="card"
            style={{
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              marginBottom: 0
            }}
            onClick={() => setActiveFolderId(folder.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'var(--primary-light)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span className="material-icons" style={{ fontSize: 24 }}>folder</span>
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 2px 0', color: 'var(--text-primary)' }}>{folder.name}</h3>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {getContactCount(folder.id)} contact{getContactCount(folder.id) === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 6 }}
                onClick={() => {
                  setEditingFolder(folder);
                  setFolderNameInput(folder.name);
                  setShowEditModal(true);
                }}
              >
                <span className="material-icons" style={{ fontSize: 20 }}>edit</span>
              </button>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 6 }}
                onClick={(e) => handleDeleteClick(folder, e)}
              >
                <span className="material-icons" style={{ fontSize: 20 }}>delete</span>
              </button>
            </div>
          </div>
        ))}

        {/* Uncategorized Folder */}
        <div
          className="card"
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            marginBottom: 0,
            background: 'var(--surface)',
            borderStyle: 'dashed'
          }}
          onClick={() => setActiveFolderId('uncategorized')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: '#F1F5F9',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span className="material-icons" style={{ fontSize: 24 }}>folder_open</span>
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 2px 0', color: 'var(--text-primary)' }}>Uncategorized</h3>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {getContactCount('uncategorized')} contact{getContactCount('uncategorized') === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <span className="material-icons" style={{ color: 'var(--border)' }}>chevron_right</span>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Create New Folder</h3>
            <form onSubmit={handleCreateSubmit}>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <input
                  className="form-input"
                  value={folderNameInput}
                  onChange={e => setFolderNameInput(e.target.value)}
                  placeholder="Folder/Event Name (e.g. Hackathon)"
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <RippleButton type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowCreateModal(false)}>Cancel</RippleButton>
                <RippleButton type="submit" className="btn btn-primary" style={{ flex: 1 }}>Create</RippleButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Edit Folder Name</h3>
            <form onSubmit={handleEditSubmit}>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <input
                  className="form-input"
                  value={folderNameInput}
                  onChange={e => setFolderNameInput(e.target.value)}
                  placeholder="Folder/Event Name"
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <RippleButton type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowEditModal(false)}>Cancel</RippleButton>
                <RippleButton type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save</RippleButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
