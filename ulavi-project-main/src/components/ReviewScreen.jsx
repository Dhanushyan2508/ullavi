import { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { useTemplates } from '../context/TemplateContext';
import ContactSelectionModal from './ContactSelectionModal';

const FIELDS = [
  { key: 'name',     label: 'Full Name',    icon: 'person' },
  { key: 'company',  label: 'Company',      icon: 'business' },
  { key: 'email',    label: 'Email',        icon: 'email' },
  { key: 'altEmail', label: 'Alt Email',    icon: 'alternate_email' },
  { key: 'phone',    label: 'Phone',        icon: 'phone' },
  { key: 'altPhone', label: 'Alt Phone',    icon: 'contact_phone' },
  
];

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

const stepsConfig = [
  { key: 'duplicateCheck', label: 'Checking duplicates...' },
  { key: 'zohoSync',      label: 'Syncing with Zoho CRM...' },
  { key: 'emailSend',     label: 'Sending Email...' },
  { key: 'whatsappSend',  label: 'Sending WhatsApp...' },
  { key: 'localSave',     label: 'Saving locally...' },
  { key: 'firebaseSave',  label: 'Saving to Firebase...' }
];

export default function ReviewScreen({ scannedData, previewUrl, onSave, onDiscard, isOffline, isProcessing = false, processingSteps = {}, failedStep = null, folders = [], onCreateFolder }) {
  const [form, setForm] = useState({
    name: '', company: '', email: '', altEmail: '',
    phone: '', altPhone: '', 
    ...scannedData,
  });
  const [emailMessage, setEmailMessage] = useState(() => {
    return `Hello ${scannedData?.name || ''},

Thank you for connecting with CardSync.

Your contact details have been saved successfully.

We look forward to staying connected.

Regards,
Team CardSync`;
  });
  const [userEditedEmail, setUserEditedEmail] = useState(false);
  const [showPicker, setShowPicker] = useState(() => {
    const hasMultiple = (scannedData?.phones?.length > 1) || (scannedData?.emails?.length > 1);
    return hasMultiple;
  });
  const [errors, setErrors] = useState({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState('whatsapp');
  const addToast = useToast();
  const { waTemplate, emailSubject, emailBody, fillTemplate } = useTemplates();

  const handleFieldChange = (key, value) => {
    setForm(prev => {
      const updated = { ...prev, [key]: value };
      if (key === 'name' && !userEditedEmail) {
        setEmailMessage(`Hello ${value || ''},

Thank you for connecting with CardSync.

Your contact details have been saved successfully.

We look forward to staying connected.

Regards,
Team CardSync`);
      }
      return updated;
    });
  };

  const handlePickerConfirm = ({ selectedPhone, selectedEmail }) => {
    const allPhones = form.phones || [];
    const allEmails = form.emails || [];
    
    // Alt values are the alternative ones in the arrays
    const altPhone = allPhones.find(p => p !== selectedPhone) || '';
    const altEmail = allEmails.find(e => e !== selectedEmail) || '';

    setForm(prev => {
      const updated = {
        ...prev,
        phone: selectedPhone,
        email: selectedEmail,
        altPhone,
        altEmail
      };
      if (!userEditedEmail) {
        setEmailMessage(`Hello ${updated.name || ''},

Thank you for connecting with CardSync.

Your contact details have been saved successfully.

We look forward to staying connected.

Regards,
Team CardSync`);
      }
      return updated;
    });
    
    console.log('[Debug] Contact Selection Confirmed:', { selectedPhone, selectedEmail, altPhone, altEmail });
    setShowPicker(false);
    addToast('Selections updated!', 'success');
  };

  const [notes, setNotes] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speechLang, setSpeechLang] = useState('en-US');

  useEffect(() => {
    if (!userEditedEmail) {
      let baseMessage = `Hello ${form.name || ''},

Thank you for connecting with CardSync.

Your contact details have been saved successfully.`;

      if (notes.trim()) {
        baseMessage += `\n\nMessage from our team:\n${notes.trim()}`;
      }

      baseMessage += `\n\nWe look forward to staying connected.

Regards,
Team CardSync`;

      setEmailMessage(baseMessage);
    }
  }, [notes, form.name, userEditedEmail]);

  // Helper to run voice recognition
  const startSpeechRecognition = (targetSetter, listeningStateSetter) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addToast('Speech recognition is not supported in this browser.', 'error');
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = speechLang;

    rec.onstart = () => {
      listeningStateSetter(true);
      addToast('Listening... Speak now.', 'info');
    };

    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      targetSetter(prev => prev ? prev + ' ' + transcript : transcript);
      listeningStateSetter(false);
      addToast('Text transcribed!', 'success');
    };

    rec.onerror = (e) => {
      console.error(e);
      listeningStateSetter(false);
      addToast('Speech recognition failed: ' + e.error, 'error');
    };

    rec.onend = () => {
      listeningStateSetter(false);
    };

    rec.start();
  };

  const [folderId, setFolderId] = useState(scannedData?.folderId || 'uncategorized');
  const [showInlineNewFolder, setShowInlineNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const handleFolderChange = (e) => {
    const val = e.target.value;
    if (val === 'create_new') {
      setShowInlineNewFolder(true);
    } else {
      setFolderId(val);
      setShowInlineNewFolder(false);
    }
  };

  const handleInlineFolderSubmit = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) {
      addToast('Folder name cannot be empty.', 'error');
      return;
    }
    try {
      const newFolder = await onCreateFolder(newFolderName.trim());
      if (newFolder && newFolder.id) {
        setFolderId(newFolder.id);
        setShowInlineNewFolder(false);
        setNewFolderName('');
        addToast('Folder created and selected!', 'success');
      }
    } catch (err) {
      addToast('Failed to create folder', 'error');
    }
  };

  const handleSave = () => {
    if (isProcessing) return;
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = true;
    if (!form.phone.trim()) newErrors.phone = true;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      addToast('Please fix required fields.', 'error');
      setTimeout(() => setErrors({}), 500); // Clear shake animation
      return;
    }

    if (notes.length > 5000) {
      addToast('Notes exceed the maximum character limit of 5000 characters.', 'error');
      return;
    }
    
    // Save selected folderId (null if uncategorized)
    const finalFolderId = folderId === 'uncategorized' ? null : folderId;

    onSave({
      ...form,
      folderId: finalFolderId,
      emailMessage: emailMessage,
      notes: notes.trim()
    });
  };

  return (
    <div className="page-content">
      {isOffline && (
        <div className="badge badge-warning" style={{ marginBottom: 16, width: '100%', justifyContent: 'center', padding: 8 }}>
          <span className="material-icons" style={{ fontSize: 14, marginRight: 6 }}>wifi_off</span>
          Offline Mode: Contact will be queued
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Verify Details</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Review the AI-extracted data below.</p>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ background: 'var(--primary)', padding: '24px 20px', color: 'white', display: 'flex', gap: 20, alignItems: 'center' }}>
          {previewUrl ? (
            <img src={previewUrl} style={{ width: 80, height: 50, objectFit: 'cover', borderRadius: 8, border: '2px solid rgba(255,255,255,0.3)' }} />
          ) : (
            <div style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700 }}>
              {form.name ? form.name[0] : '?'}
            </div>
          )}
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{form.name || 'Extracted Name'}</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>{form.company || 'Company Name'}</div>
          </div>
        </div>
        <div style={{ padding: 20 }}>
          {FIELDS.map(f => (
            form[f.key] && (
              <div key={f.key} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <span className="material-icons" style={{ color: 'var(--primary)', fontSize: 20 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{f.label} <span className="badge badge-primary" style={{ fontSize: 8, padding: '1px 4px', marginLeft: 4 }}>AI</span></div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{form[f.key]}</div>
                </div>
              </div>
            )
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 24 }}>Edit Information</h3>
        {FIELDS.map(f => {
          const hasMultipleOptions = 
            (f.key === 'phone' && form.phones?.length > 1) || 
            (f.key === 'email' && form.emails?.length > 1);

          return (
            <div key={f.key} className={`form-group ${errors[f.key] ? 'shake' : ''}`}>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  value={form[f.key] || ''}
                  onChange={e => handleFieldChange(f.key, e.target.value)}
                  placeholder=" "
                  style={{
                    borderColor: errors[f.key] ? 'var(--danger)' : '',
                    paddingRight: hasMultipleOptions ? '95px' : ''
                  }}
                />
                <label className="form-label">{f.label}</label>
                {hasMultipleOptions && (
                  <button
                    type="button"
                    onClick={() => setShowPicker(true)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'var(--primary-light, rgba(37, 99, 235, 0.1))',
                      color: 'var(--primary)',
                      border: 'none',
                      padding: '4px 10px',
                      borderRadius: 8,
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      zIndex: 10
                    }}
                  >
                    <span className="material-icons" style={{ fontSize: 13 }}>tune</span>
                    Change
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Select Folder Dropdown */}
        <div className="form-group" style={{ marginTop: 24, marginBottom: showInlineNewFolder ? 12 : 0 }}>
          <div style={{ position: 'relative' }}>
            <select
              className="form-input"
              value={folderId}
              onChange={handleFolderChange}
              style={{ appearance: 'none', paddingRight: '40px' }}
            >
              <option value="uncategorized">Uncategorized</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
              <option value="create_new" style={{ fontWeight: 'bold', color: 'var(--primary)' }}>+ Create New Folder...</option>
            </select>
            <label className="form-label" style={{ top: '-10px', left: '12px', fontSize: '11px', fontWeight: 700, color: 'var(--primary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Select Folder/Event</label>
            <span className="material-icons" style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }}>expand_more</span>
          </div>
        </div>

        {/* Inline New Folder Input */}
        {showInlineNewFolder && (
          <form onSubmit={handleInlineFolderSubmit} style={{ display: 'flex', gap: 8, marginTop: 12, animation: 'popIn 0.3s ease' }}>
            <input
              className="form-input"
              style={{ flex: 1, padding: '10px 14px', fontSize: 14 }}
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="Enter new folder name"
              autoFocus
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '10px 16px', borderRadius: 'var(--radius-input)', fontSize: 13 }}>Add</button>
            <button type="button" className="btn btn-outline" style={{ padding: '10px 16px', borderRadius: 'var(--radius-input)', fontSize: 13 }} onClick={() => setShowInlineNewFolder(false)}>Cancel</button>
          </form>
        )}
      </div>

      {/* Notes & Remarks Card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <span className="material-icons" style={{ color: 'var(--primary)' }}>notes</span>
            Notes & Remarks
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-secondary)' }}>language</span>
            <select
              value={speechLang}
              onChange={e => setSpeechLang(e.target.value)}
              style={{ border: 'none', background: 'none', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, outline: 'none' }}
            >
              <option value="en-US">English (US)</option>
              <option value="en-IN">English (India)</option>
              <option value="es-ES">Español</option>
              <option value="fr-FR">Français</option>
            </select>
          </div>
        </div>

        {/* Notes & Remarks textarea */}
        <div style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)' }}>
              <span className="material-icons" style={{ fontSize: 16 }}>edit_note</span>
              Notes / Remarks
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(notes);
                  addToast('Copied notes to clipboard', 'success');
                }}
                disabled={!notes}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                title="Copy Note"
              >
                <span className="material-icons" style={{ fontSize: 18 }}>content_copy</span>
              </button>
              <button
                type="button"
                onClick={() => setNotes('')}
                disabled={!notes}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--danger)', display: 'flex', alignItems: 'center' }}
                title="Clear Note"
              >
                <span className="material-icons" style={{ fontSize: 18 }}>clear</span>
              </button>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <textarea
              className="form-input"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add remarks, congratulations, follow-up details, or personalized messages..."
              style={{ minHeight: 120, paddingRight: '44px', fontSize: 13, resize: 'vertical' }}
              maxLength={5000}
            />
            <button
              type="button"
              onClick={() => startSpeechRecognition(setNotes, setIsListening)}
              style={{
                position: 'absolute',
                right: 8,
                bottom: 8,
                background: isListening ? 'var(--danger-light)' : 'var(--primary-light)',
                color: isListening ? 'var(--danger)' : 'var(--primary)',
                border: 'none',
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              title="Voice Input"
            >
              <span className="material-icons" style={{ fontSize: 18, animation: isListening ? 'pulse 1.5s infinite' : 'none' }}>
                {isListening ? 'mic_off' : 'mic'}
              </span>
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
            <span>Dictate or type your note</span>
            <span>{notes.length} / 5000</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-icons" style={{ color: 'var(--primary)', fontSize: 20 }}>email</span>
          Follow-up Email Message
        </h3>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <div style={{ position: 'relative' }}>
            <textarea
              className="form-input"
              value={emailMessage}
              onChange={e => {
                setEmailMessage(e.target.value);
                setUserEditedEmail(true);
              }}
              placeholder=" "
              style={{
                height: 'auto',
                paddingTop: 12,
                paddingBottom: 12,
                resize: 'vertical',
                minHeight: '150px',
                fontFamily: 'inherit',
                lineHeight: '1.5'
              }}
            />
            <label className="form-label">Email Message</label>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 24, overflow: 'hidden' }}>
        <button onClick={() => setPreviewOpen(!previewOpen)} style={{ width: '100%', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: 'var(--text-primary)' }}>
            <span className="material-icons" style={{ color: 'var(--primary)' }}>visibility</span>
            Message Preview
          </div>
          <span className="material-icons" style={{ color: 'var(--text-secondary)' }}>{previewOpen ? 'expand_less' : 'expand_more'}</span>
        </button>
        {previewOpen && (
          <div style={{ padding: '0 20px 20px 20px' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, background: 'var(--background)', padding: 4, borderRadius: 12 }}>
              <button onClick={() => setPreviewTab('whatsapp')} style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', background: previewTab === 'whatsapp' ? 'white' : 'transparent', boxShadow: previewTab === 'whatsapp' ? 'var(--shadow-sm)' : 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: previewTab === 'whatsapp' ? 'var(--primary)' : 'var(--text-secondary)' }}>WhatsApp</button>
              <button onClick={() => setPreviewTab('email')} style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', background: previewTab === 'email' ? 'white' : 'transparent', boxShadow: previewTab === 'email' ? 'var(--shadow-sm)' : 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: previewTab === 'email' ? 'var(--primary)' : 'var(--text-secondary)' }}>Email</button>
            </div>
            {previewTab === 'whatsapp' ? (
              <div className="wa-chat-bg">
                <div className="wa-bubble">{fillTemplate(waTemplate, form)}</div>
              </div>
            ) : (
              <div className="email-preview">
                <div className="email-preview-header">
                  <strong>Subject:</strong> {fillTemplate(emailSubject, form)}
                </div>
                 <div className="email-preview-body" style={{ whiteSpace: 'pre-wrap' }}>{emailMessage}</div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <RippleButton 
          className="btn btn-outline" 
          style={{ flex: 1 }} 
          onClick={isProcessing ? undefined : onDiscard}
          disabled={isProcessing}
        >
          Discard
        </RippleButton>
        <RippleButton 
          className="btn btn-success" 
          style={{ flex: 2 }} 
          onClick={handleSave}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <>
              <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2, borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.2)' }} />
              Processing...
            </>
          ) : (
            <>
              <span className="material-icons">send</span>
              {failedStep ? 'Retry Save & Send' : 'Save & Send'}
            </>
          )}
        </RippleButton>
      </div>

      {(isProcessing || failedStep !== null) && (
        <div className="card" style={{
          marginBottom: 32,
          padding: 20,
          background: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(10px)',
          borderRadius: 'var(--radius-card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-md)',
          animation: 'pageIn 0.3s ease-out'
        }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            {failedStep ? (
              <>
                <span className="material-icons" style={{ color: 'var(--danger)', fontSize: 18 }}>error</span>
                <span style={{ color: 'var(--danger)' }}>Save & Send Failed</span>
              </>
            ) : (
              <>
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                <span>Processing Dispatches...</span>
              </>
            )}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {stepsConfig.map((step) => {
              const status = processingSteps[step.key];
              const isIdle = status === 'idle' || !status;
              const isRunning = status === 'running';
              const isSuccess = status === 'success';
              const isQueued = status === 'queued';
              const isFailed = status === 'failed';

              let icon = 'radio_button_unchecked';
              let iconColor = 'var(--text-secondary)';
              let textColor = 'var(--text-secondary)';
              let statusText = 'Pending';
              let stepClass = '';

              if (isRunning) {
                icon = 'sync';
                iconColor = 'var(--primary)';
                textColor = 'var(--text-primary)';
                statusText = 'In progress...';
                stepClass = 'syncing-icon';
              } else if (isSuccess) {
                icon = 'check_circle';
                iconColor = 'var(--success)';
                textColor = 'var(--success)';
                statusText = 'Done';
              } else if (isQueued) {
                icon = 'hourglass_empty';
                iconColor = 'var(--warning)';
                textColor = 'var(--warning)';
                statusText = 'Queued';
              } else if (isFailed) {
                icon = 'cancel';
                iconColor = 'var(--danger)';
                textColor = 'var(--danger)';
                statusText = 'Failed';
              }

              return (
                <div key={step.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: isIdle ? 0.5 : 1, transition: 'all 0.3s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className={`material-icons ${stepClass}`} style={{ color: iconColor, fontSize: 18 }}>{icon}</span>
                    <span style={{ fontSize: 13, fontWeight: isRunning || isSuccess || isFailed || isQueued ? 600 : 400, color: textColor }}>{step.label}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: iconColor }}>{statusText}</span>
                </div>
              );
            })}
            
            {processingSteps.localSave === 'success' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '8px 12px', background: 'var(--success-light)', borderRadius: 10, animation: 'popIn 0.3s ease' }}>
                <span className="material-icons" style={{ color: 'var(--success)', fontSize: 18 }}>done_all</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>Completed! Redirecting...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {showPicker && (
        <ContactSelectionModal
          phones={form.phones || []}
          emails={form.emails || []}
          currentPhone={form.phone}
          currentEmail={form.email}
          ocrLines={form.ocrLines || []}
          onConfirm={handlePickerConfirm}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
