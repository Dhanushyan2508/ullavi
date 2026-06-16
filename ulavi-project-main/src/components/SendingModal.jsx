import { useState, useEffect } from 'react';
import { createZohoLead } from '../services/zohoApi';
import { sendEmail } from '../services/emailService';
import { sendWhatsAppMessage } from '../services/whatsappService';

export default function SendingModal({ contact, isOffline, onComplete }) {
  const [waProgress, setWaProgress] = useState(0);
  const [emailProgress, setEmailProgress] = useState(0);
  const [zohoProgress, setZohoProgress] = useState(0);
  
  const [waStatus, setWaStatus] = useState('sending');
  const [emailStatus, setEmailStatus] = useState('sending');
  const [zohoStatus, setZohoStatus] = useState('sending');
  const [zohoLeadId, setZohoLeadId] = useState(null);
  
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    let active = true;

    const runWorkflows = async () => {
      if (isOffline) {
        setWaProgress(100);
        setWaStatus('queued');
        setEmailProgress(100);
        setEmailStatus('queued');
        setZohoProgress(100);
        setZohoStatus('queued');
        setAllDone(true);
        return;
      }

      // 1. Online: Run real Zoho CRM sync first
      let zohoStatusResult = 'failed';
      let zohoLeadIdResult = null;
      let zohoInterval = null;
      try {
        setZohoProgress(10);
        if (contact && contact.zohoLeadId) {
          console.log('✓ Zoho Lead ID already exists, skipping API call');
          zohoLeadIdResult = contact.zohoLeadId;
          zohoStatusResult = 'synced';
          setZohoProgress(100);
        } else {
          zohoInterval = setInterval(() => {
            setZohoProgress(prev => Math.min(prev + 10, 90));
          }, 100);
          
          const res = await createZohoLead(contact);
          if (zohoInterval) clearInterval(zohoInterval);
          zohoLeadIdResult = res?.zohoLeadId || null;
          zohoStatusResult = 'synced';
          setZohoProgress(100);
        }
      } catch (err) {
        console.error('Workflow failed at Zoho CRM Sync:', err);
        if (zohoInterval) clearInterval(zohoInterval);
        setZohoProgress(100);
        zohoStatusResult = 'failed';
      }

      if (!active) return;
      setZohoStatus(zohoStatusResult);
      if (zohoLeadIdResult) {
        setZohoLeadId(zohoLeadIdResult);
      }

      // 2. Next: EmailJS send
      let emailStatusResult = 'failed';
      let emailProgressInterval = null;
      try {
        setEmailProgress(10);
        emailProgressInterval = setInterval(() => {
          setEmailProgress(prev => Math.min(prev + 10, 90));
        }, 100);

        const emailResult = await sendEmail(contact, contact.emailMessage);
        if (emailProgressInterval) clearInterval(emailProgressInterval);
        
        setEmailProgress(100);
        if (emailResult && emailResult.success) {
          emailStatusResult = 'sent';
        } else {
          emailStatusResult = 'failed';
        }
      } catch (err) {
        console.error('Workflow failed at Email send:', err);
        if (emailProgressInterval) clearInterval(emailProgressInterval);
        setEmailProgress(100);
        emailStatusResult = 'failed';
      }

      if (!active) return;
      setEmailStatus(emailStatusResult);

      // 3. WhatsApp Meta API call
      let waStatusResult = 'failed';
      let waProgressInterval = null;
      try {
        setWaProgress(10);
        waProgressInterval = setInterval(() => {
          setWaProgress(prev => Math.min(prev + 15, 90));
        }, 100);

        const waResult = await sendWhatsAppMessage(contact);
        if (waProgressInterval) clearInterval(waProgressInterval);
        
        setWaProgress(100);
        if (waResult.success) {
          waStatusResult = 'sent';
        } else {
          waStatusResult = 'failed';
        }
      } catch (err) {
        console.error('Workflow failed at WhatsApp send:', err);
        if (waProgressInterval) clearInterval(waProgressInterval);
        setWaProgress(100);
        waStatusResult = 'failed';
      }

      if (!active) return;
      setWaStatus(waStatusResult);
      setAllDone(true);
    };

    runWorkflows();

    return () => {
      active = false;
    };
  }, [isOffline, contact]);

  const StatusRow = ({ label, icon, color, progress, status }) => {
    const isSending = status === 'sending';
    const isSent = status === 'sent' || status === 'synced';
    const isQueued = status === 'queued';
    const isFailed = status === 'failed';

    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
            <span className="material-icons" style={{ color }}>{icon}</span>
            {label}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: isFailed ? 'var(--danger)' : 'inherit' }}>
            {isSending ? `${progress}%` : isSent ? (status === 'synced' ? 'SYNCED' : 'DELIVERED') : isFailed ? 'FAILED' : 'QUEUED'}
          </div>
        </div>
        <div style={{ height: 6, background: 'var(--background)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ 
            height: '100%', 
            width: `${progress}%`, 
            background: isQueued ? 'var(--warning)' : isFailed ? 'var(--danger)' : color, 
            transition: 'width 0.3s ease',
            borderRadius: 10
          }} />
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal-sheet" style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: 24 }}>
          <div className="spinner" style={{ margin: '0 auto 16px', width: 48, height: 48, borderWidth: 4 }} />
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{allDone ? 'Success!' : 'Processing Dispatches'}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{allDone ? 'Your dispatches are updated.' : 'Please wait while we process the dispatch.'}</p>
        </div>

        <div style={{ textAlign: 'left', marginBottom: 24 }}>
          <StatusRow label="WhatsApp" icon="chat" color="#16A34A" progress={waProgress} status={waStatus} />
          <StatusRow label="Email" icon="email" color="var(--primary)" progress={emailProgress} status={emailStatus} />
          <StatusRow label="Zoho CRM Sync" icon="cloud_sync" color="#EA580C" progress={zohoProgress} status={zohoStatus} />
        </div>

        {allDone && (
          <button className="btn btn-primary btn-full status-sent" onClick={() => onComplete(waStatus, emailStatus, zohoStatus, zohoLeadId)}>
            Continue to Contacts
          </button>
        )}
      </div>
    </div>
  );
}
