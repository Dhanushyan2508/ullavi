import { useState, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import './index.css';
import { useToast } from './context/ToastContext';
import { initialContacts } from './data/contacts';
import BottomNav from './components/BottomNav';
import ScanScreen from './components/ScanScreen';
import ReviewScreen from './components/ReviewScreen';
import ContactsScreen from './components/ContactsScreen';
import FoldersScreen from './components/FoldersScreen';
import { useTemplates } from './context/TemplateContext';
import { initDB, getContactsFromDB, saveContactToDB, deleteContactFromDB, getQueue, getFoldersFromDB, saveFolderToDB, deleteFolderFromDB } from './storage/db';
import { enqueueAction, processQueue } from './queue/offlineQueue';
import DuplicateModal from './components/duplicate/DuplicateModal';
import { findDuplicates } from './utils/duplicateCheck';
import { searchZohoDuplicate } from './services/zohoSearchService';
import API_BASE_URL from './config/api';
import { createZohoLead } from './services/zohoApi';
import { sendEmail } from './services/emailService';
import { sendWhatsAppMessage } from './services/whatsappService';
import { saveContactToFirebase, deleteContactFromFirebase, isFirebaseConfigured } from './services/firebaseService';

const AVATAR_COLORS = ['#2563EB', '#D97706', '#16A34A', '#64748B', '#DC2626', '#7C3AED', '#DB2777'];

function App() {
  const [page, setPage] = useState('scan');
  const [contacts, setContacts] = useState([]);
  const [scannedData, setScannedData] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showSending, setShowSending] = useState(false);
  const [pendingContact, setPendingContact] = useState(null);
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showSplash, setShowSplash] = useState(true);
  const [duplicates, setDuplicates] = useState(null);
  const [pendingNewContact, setPendingNewContact] = useState(null);
  const [isCheckingZoho, setIsCheckingZoho] = useState(false);
  const [folders, setFolders] = useState([]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState({
    duplicateCheck: 'idle',
    zohoSync: 'idle',
    emailSend: 'idle',
    whatsappSend: 'idle',
    localSave: 'idle',
    firebaseSave: 'idle'
  });
  const [failedStep, setFailedStep] = useState(null);
  const [contactProgressDetails, setContactProgressDetails] = useState({});

  const addToast = useToast();
  const { emailSubject, fillTemplate } = useTemplates();

  const updateQueueCount = async () => {
    const q = await getQueue();
    const active = q.filter(item => {
      if (item.status === 'completed') return false;
      if (item.status === 'failed' && (item.retryCount || 0) >= 3) return false;
      return true;
    });
    setQueueCount(active.length);
    return active.length;
  };

  const prepareContacts = (dbContacts) => {
    return dbContacts.map(c => {
      if (c.imageBlob) {
        c.previewUrl = URL.createObjectURL(c.imageBlob);
      }
      return c;
    });
  };

  const handleSyncResult = (contact, status) => {
    if (status === 'synced') {
      addToast('Contact synced to Zoho CRM', 'success');
    } else if (status === 'duplicate') {
      addToast('Existing Zoho lead detected', 'info');
    } else if (status === 'failed') {
      addToast('Zoho CRM sync failed.', 'error');
    }
  };

  const handleManualSync = async () => {
    if (isOffline) {
      addToast('Cannot sync while offline.', 'warning');
      return;
    }
    if (isSyncing) return;
    setIsSyncing(true);
    addToast('Syncing queued contacts...', 'info');
    await processQueue(async (updatedContacts) => {
      if (updatedContacts) {
        setContacts(prepareContacts(updatedContacts).sort((a, b) => b.id - a.id));
      } else {
        const dbContacts = await getContactsFromDB();
        setContacts(prepareContacts(dbContacts).sort((a, b) => b.id - a.id));
      }
      await updateQueueCount();
      addToast('Sync complete!', 'success');
    }, handleSyncResult);
    setIsSyncing(false);
  };

  useEffect(() => {
    // Splash screen timer
    setTimeout(() => setShowSplash(false), 2000);
    console.log('✓ Current API Base URL:', API_BASE_URL);

    // Pre-fetch Tesseract core and language data to cache them offline in the PWA service worker
    const prefetchTesseract = async () => {
      if (navigator.onLine) {
        try {
          console.log('[Tesseract] Warm-up pre-fetching core & worker assets...');
          const dummyImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
          await Tesseract.recognize(dummyImage, 'eng');
          console.log('[Tesseract] Cache warm-up successful. Ready for offline OCR.');
        } catch (err) {
          console.warn('[Tesseract] Cache pre-fetch warning:', err);
        }
      }
    };
    prefetchTesseract();

    const loadData = async () => {
      await initDB();
      let dbContacts = await getContactsFromDB();
      if (dbContacts.length > 0) {
        setContacts(prepareContacts(dbContacts).sort((a, b) => b.id - a.id));
      } else {
        setContacts(prepareContacts(initialContacts));
        for (const c of initialContacts) {
          await saveContactToDB(c);
        }
        dbContacts = initialContacts;
      }
      // Load Folders
      let dbFolders = await getFoldersFromDB();
      if (dbFolders.length === 0) {
        const defaultFolders = [
          { id: 'tech_conf_2026', name: 'Tech Conference 2026', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: 'hackathon', name: 'Hackathon', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: 'client_meeting', name: 'Client Meeting', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: 'startup_expo', name: 'Startup Expo', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: 'workshop', name: 'Workshop', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ];
        for (const folder of defaultFolders) {
          await saveFolderToDB(folder);
        }
        dbFolders = defaultFolders;
      }
      setFolders(dbFolders);

      await updateQueueCount();

      // Auto-sync on startup if online
      const q = await getQueue();
      if (navigator.onLine && q.length > 0) {
        addToast('Syncing queued contacts...', 'info');
        setIsSyncing(true);
        await processQueue(async (updatedContacts) => {
          if (updatedContacts) {
            setContacts(prepareContacts(updatedContacts).sort((a, b) => b.id - a.id));
          }
          await updateQueueCount();
          addToast('Sync complete!', 'success');
        }, handleSyncResult);
        setIsSyncing(false);
      }
    };
    loadData();

    const handleOnline = async () => {
      console.log('✓ Internet Restored');
      setIsOffline(false);
      const q = await getQueue();
      if (q.length > 0) {
        addToast('Syncing queued contacts...', 'info');
      }
      setIsSyncing(true);
      await processQueue(async (updatedContacts) => {
        if (updatedContacts) {
          setContacts(prepareContacts(updatedContacts).sort((a, b) => b.id - a.id));
        } else {
          const dbContacts = await getContactsFromDB();
          setContacts(prepareContacts(dbContacts).sort((a, b) => b.id - a.id));
        }
        await updateQueueCount();
        addToast('Sync complete!', 'success');
      }, handleSyncResult);
      setIsSyncing(false);
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowInstallPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleCardScanned = async (data, imgUrl) => {
    if (data.offlineSync) {
      const dbContacts = await getContactsFromDB();
      setContacts(prepareContacts(dbContacts).sort((a, b) => b.id - a.id));
      await updateQueueCount();
      setPage('contacts');
      return;
    }
    setScannedData(data);
    setPreviewUrl(imgUrl);
    setPage('review');
  };

  const handleSaveContact = async (formData) => {
    if (isProcessing && failedStep === null) return;

    setIsProcessing(true);
    setFailedStep(null);
    
    const steps = { ...processingSteps };
    const isRetry = failedStep !== null;
    
    let currentStepsState = {
      duplicateCheck: isRetry ? steps.duplicateCheck : 'idle',
      zohoSync: isRetry ? steps.zohoSync : 'idle',
      emailSend: isRetry ? steps.emailSend : 'idle',
      whatsappSend: isRetry ? steps.whatsappSend : 'idle',
      localSave: isRetry ? steps.localSave : 'idle',
      firebaseSave: isRetry ? steps.firebaseSave : 'idle'
    };

    setProcessingSteps(currentStepsState);
    
    console.log('[TimeLog] --- Save & Send Clicked ---');
    const totalStartTime = performance.now();

    try {
      let activeForm = { ...formData };
      console.log('[SaveSend] Final contact object before dispatch:', JSON.stringify(activeForm, null, 2));
      
      // Step 1: Duplicate Check
      if (currentStepsState.duplicateCheck !== 'success') {
        console.log('[TimeLog] Duplicate Check Start');
        const dupStartTime = performance.now();
        
        currentStepsState = { ...currentStepsState, duplicateCheck: 'running' };
        setProcessingSteps(currentStepsState);

        // First check local database duplicates
        const foundDuplicates = findDuplicates(activeForm, contacts);
        if (foundDuplicates.length > 0) {
          console.log('[TimeLog] Duplicate Check End (Local duplicates found)');
          setDuplicates(foundDuplicates);
          setPendingNewContact(activeForm);
          return;
        }

        if (!isOffline) {
          try {
            const result = await searchZohoDuplicate(activeForm);
            if (result.duplicate && result.lead) {
              console.log('[TimeLog] Duplicate Check End (Zoho duplicate found)');
              
              const mappedLead = {
                id: result.lead.id,
                name: result.lead.Last_Name || '',
                company: result.lead.Company || '',
                email: result.lead.Email || '',
                phone: result.lead.Phone || '',
                zohoLeadId: result.lead.id,
                isZohoLead: true
              };

              const duplicateItem = {
                contact: mappedLead,
                matches: [],
                isExact: false,
                isPartial: true
              };

              if (activeForm.email && result.lead.Email && activeForm.email.trim().toLowerCase() === result.lead.Email.trim().toLowerCase()) {
                duplicateItem.matches.push('email');
              }
              if (activeForm.phone && result.lead.Phone && activeForm.phone.trim() === result.lead.Phone.trim()) {
                duplicateItem.matches.push('phone');
              }
              if (activeForm.name && result.lead.Last_Name && activeForm.name.trim().toLowerCase() === result.lead.Last_Name.trim().toLowerCase()) {
                duplicateItem.matches.push('name');
              }
              duplicateItem.isExact = duplicateItem.matches.length >= 3;

              setDuplicates([duplicateItem]);
              setPendingNewContact(activeForm);
              return;
            }
          } catch (err) {
            console.warn('Zoho duplicate check failed:', err);
            addToast('Unable to verify duplicates in Zoho CRM.', 'warning');
          }
        }
        
        const dupEndTime = performance.now();
        console.log(`[TimeLog] Duplicate Check End. Duration: ${(dupEndTime - dupStartTime).toFixed(2)}ms`);
        currentStepsState = { ...currentStepsState, duplicateCheck: 'success' };
        setProcessingSteps(currentStepsState);
      }

      await runRemainingSteps(activeForm, currentStepsState, totalStartTime, false);

    } catch (err) {
      setIsProcessing(false);
      console.error('Save sequence error:', err);
    }
  };

  const runRemainingSteps = async (activeForm, currentStepsState, totalStartTime, skipSending = false) => {
    let zohoLeadIdResult = contactProgressDetails.zohoLeadId || activeForm.zohoLeadId || null;
    let localSteps = { ...currentStepsState };

    try {
      // Step 2: Zoho CRM Sync
      if (localSteps.zohoSync !== 'success' && localSteps.zohoSync !== 'queued') {
        console.log('[TimeLog] Zoho CRM Sync Start');
        const zohoStartTime = performance.now();

        localSteps = { ...localSteps, zohoSync: 'running' };
        setProcessingSteps(localSteps);

        if (isOffline) {
          localSteps = { ...localSteps, zohoSync: 'queued' };
          setProcessingSteps(localSteps);
          console.log('[TimeLog] Zoho CRM Sync End (Queued offline)');
        } else if (skipSending) {
          localSteps = { ...localSteps, zohoSync: 'success' };
          setProcessingSteps(localSteps);
          console.log('[TimeLog] Zoho CRM Sync End (Skipped)');
        } else {
          if (zohoLeadIdResult) {
            console.log('✓ Zoho Lead ID already exists, skipping API call:', zohoLeadIdResult);
            localSteps = { ...localSteps, zohoSync: 'success' };
            setProcessingSteps(localSteps);
          } else {
            try {
              const res = await createZohoLead(activeForm);
              zohoLeadIdResult = res?.zohoLeadId || null;
              setContactProgressDetails(prev => ({ ...prev, zohoLeadId: zohoLeadIdResult }));
              localSteps = { ...localSteps, zohoSync: 'success' };
              setProcessingSteps(localSteps);
              const zohoEndTime = performance.now();
              console.log(`[TimeLog] Zoho CRM Sync End. Duration: ${(zohoEndTime - zohoStartTime).toFixed(2)}ms`);
            } catch (err) {
              console.error('Zoho sync error:', err);
              localSteps = { ...localSteps, zohoSync: 'failed' };
              setProcessingSteps(localSteps);
              setFailedStep('zohoSync');
              setIsProcessing(false);
              addToast('Zoho CRM sync failed.', 'error');
              return;
            }
          }
        }
      }

      // Step 3: Sending Email
      if (localSteps.emailSend !== 'success' && localSteps.emailSend !== 'queued') {
        console.log('[TimeLog] Email Send Start');
        const emailStartTime = performance.now();

        localSteps = { ...localSteps, emailSend: 'running' };
        setProcessingSteps(localSteps);

        if (isOffline) {
          localSteps = { ...localSteps, emailSend: 'queued' };
          setProcessingSteps(localSteps);
          console.log('[TimeLog] Email Send End (Queued offline)');
        } else if (skipSending) {
          localSteps = { ...localSteps, emailSend: 'success' };
          setProcessingSteps(localSteps);
          console.log('[TimeLog] Email Send End (Skipped)');
        } else if (!activeForm.email || typeof activeForm.email !== 'string' || activeForm.email.trim().length === 0) {
          console.log('[TimeLog] Email Send skipped because recipient email is missing');
          localSteps = { ...localSteps, emailSend: 'success' };
          setProcessingSteps(localSteps);
        } else {
          try {
            const emailResult = await sendEmail(activeForm, activeForm.emailMessage);
            if (emailResult && emailResult.success) {
              localSteps = { ...localSteps, emailSend: 'success' };
              setProcessingSteps(localSteps);
              const emailEndTime = performance.now();
              console.log(`[TimeLog] Email Send End. Duration: ${(emailEndTime - emailStartTime).toFixed(2)}ms`);
            } else {
              throw new Error(emailResult.error || 'EmailJS returned failure');
            }
          } catch (err) {
            console.error('Email send error:', err);
            localSteps = { ...localSteps, emailSend: 'failed' };
            setProcessingSteps(localSteps);
            setFailedStep('emailSend');
            setIsProcessing(false);
            addToast(err.message || 'Email delivery failed.', 'error');
            return;
          }
        }
      }

      // Step 4: Sending WhatsApp
      if (localSteps.whatsappSend !== 'success' && localSteps.whatsappSend !== 'queued') {
        console.log('[TimeLog] WhatsApp Send Start');
        const waStartTime = performance.now();

        localSteps = { ...localSteps, whatsappSend: 'running' };
        setProcessingSteps(localSteps);

        if (isOffline) {
          localSteps = { ...localSteps, whatsappSend: 'queued' };
          setProcessingSteps(localSteps);
          console.log('[TimeLog] WhatsApp Send End (Queued offline)');
        } else if (skipSending) {
          localSteps = { ...localSteps, whatsappSend: 'success' };
          setProcessingSteps(localSteps);
          console.log('[TimeLog] WhatsApp Send End (Skipped)');
        } else {
          try {
            const waResult = await sendWhatsAppMessage(activeForm);
            if (waResult && waResult.success) {
              localSteps = { ...localSteps, whatsappSend: 'success' };
              setProcessingSteps(localSteps);
              const waEndTime = performance.now();
              console.log(`[TimeLog] WhatsApp Send End. Duration: ${(waEndTime - waStartTime).toFixed(2)}ms`);
            } else {
              throw new Error(waResult.error || 'Meta API returned failure');
            }
          } catch (err) {
            console.error('WhatsApp send error (continuing save flow):', err);
            localSteps = { ...localSteps, whatsappSend: 'failed' };
            setProcessingSteps(localSteps);
            addToast(err.message || 'WhatsApp sending failed, but contact save is proceeding.', 'warning');
          }
        }
      }

      // Step 5: Saving Locally & Firebase Sync
      if (localSteps.localSave !== 'success') {
        console.log('[TimeLog] Local Save Start');
        const localSaveStartTime = performance.now();

        localSteps = { ...localSteps, localSave: 'running' };
        setProcessingSteps(localSteps);

        const waStatus = localSteps.whatsappSend === 'success' ? 'sent' : (localSteps.whatsappSend === 'queued' ? 'queued' : 'failed');
        const emailStatus = localSteps.emailSend === 'success' ? 'sent' : (localSteps.emailSend === 'queued' ? 'queued' : 'failed');
        const zohoStatus = localSteps.zohoSync === 'success' ? 'synced' : (localSteps.zohoSync === 'queued' ? 'queued' : 'failed');

        const finalContact = {
          ...activeForm,
          id: activeForm.id || Date.now(),
          folderId: activeForm.folderId || null,
          notes: activeForm.notes || '',
          createdAt: activeForm.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: activeForm.status || 'new',
          whatsappStatus: waStatus,
          emailStatus: emailStatus,
          zohoStatus: zohoStatus,
          syncStatus: zohoStatus === 'synced' ? 'synced' : 'pending',
          zohoLeadId: zohoLeadIdResult,
          syncedToZoho: zohoStatus === 'synced' ? true : (activeForm.syncedToZoho || false),
          lastSyncAt: zohoStatus === 'synced' ? new Date().toISOString() : (activeForm.lastSyncAt || null),
          scannedAt: activeForm.scannedAt || new Date().toISOString(),
          avatarColor: activeForm.avatarColor || AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
        };

        if (finalContact.imageBlob && !finalContact.previewUrl) {
          finalContact.previewUrl = URL.createObjectURL(finalContact.imageBlob);
        }

        try {
          await saveContactToDB(finalContact);
          setContacts(prev => {
            const exists = prev.some(c => c.id === finalContact.id);
            if (exists) {
              return prev.map(c => c.id === finalContact.id ? finalContact : c);
            } else {
              return [finalContact, ...prev];
            }
          });

          if (waStatus === 'queued') {
            await enqueueAction('SEND_WHATSAPP', { contactId: finalContact.id });
          }
          if (emailStatus === 'queued') {
            await enqueueAction('SEND_EMAIL', {
              contactId: finalContact.id,
              email: finalContact.email,
              subject: fillTemplate(emailSubject, finalContact),
              message: finalContact.emailMessage
            });
          }
          if (zohoStatus === 'queued') {
            await enqueueAction('SYNC_ZOHO', { contactId: finalContact.id, contactData: finalContact });
          }

          // Firebase sync (non-blocking - failure won't stop the flow)
          if (!isOffline && isFirebaseConfigured()) {
            try {
              localSteps = { ...localSteps, firebaseSave: 'running' };
              setProcessingSteps(localSteps);
              const fbResult = await saveContactToFirebase(finalContact);
              if (fbResult.success) {
                localSteps = { ...localSteps, firebaseSave: 'success' };
                setProcessingSteps(localSteps);
              } else {
                localSteps = { ...localSteps, firebaseSave: 'failed' };
                setProcessingSteps(localSteps);
              }
            } catch (err) {
              console.error('Firebase save error (continuing):', err);
              localSteps = { ...localSteps, firebaseSave: 'failed' };
              setProcessingSteps(localSteps);
            }
          } else if (isOffline) {
            localSteps = { ...localSteps, firebaseSave: 'queued' };
            setProcessingSteps(localSteps);
            await enqueueAction('SYNC_FIREBASE', { contactId: finalContact.id, contactData: finalContact });
          } else {
            localSteps = { ...localSteps, firebaseSave: 'success' };
            setProcessingSteps(localSteps);
          }

          await updateQueueCount();

          localSteps = { ...localSteps, localSave: 'success' };
          setProcessingSteps(localSteps);
          const localSaveEndTime = performance.now();
          console.log(`[TimeLog] Local Save End. Duration: ${(localSaveEndTime - localSaveStartTime).toFixed(2)}ms`);

        } catch (err) {
          console.error('Local save error:', err);
          localSteps = { ...localSteps, localSave: 'failed' };
          setProcessingSteps(localSteps);
          setFailedStep('localSave');
          setIsProcessing(false);
          addToast('Saving locally failed.', 'error');
          return;
        }
      }

      // Completed
      const totalEndTime = performance.now();
      console.log(`[TimeLog] Save & Send completed successfully! Total Duration: ${(totalEndTime - totalStartTime).toFixed(2)}ms`);

      if (localSteps.zohoSync === 'queued') {
        addToast('Contact saved successfully (offline)', 'success');
        addToast('Lead sync queued (offline)', 'info');
      } else {
        addToast('Contact saved successfully. Zoho CRM, Email, and WhatsApp completed.', 'success');
      }

      setIsProcessing(false);
      setFailedStep(null);
      setContactProgressDetails({});
      setProcessingSteps({
        duplicateCheck: 'idle',
        zohoSync: 'idle',
        emailSend: 'idle',
        whatsappSend: 'idle',
        localSave: 'idle',
        firebaseSave: 'idle'
      });

      setScannedData(null);
      setPreviewUrl(null);
      setPage('contacts');

    } catch (err) {
      console.error('Unexpected error in runRemainingSteps:', err);
      setIsProcessing(false);
      addToast('An unexpected error occurred during saving.', 'error');
    }
  };

  const handleDuplicateCancel = () => {
    setDuplicates(null);
    setPendingNewContact(null);
    setIsProcessing(false);
    setFailedStep(null);
    setProcessingSteps({
      duplicateCheck: 'idle',
      zohoSync: 'idle',
      emailSend: 'idle',
      whatsappSend: 'idle',
      localSave: 'idle',
      firebaseSave: 'idle'
    });
  };

  const handleDuplicateSaveAsNew = async (newContact) => {
    setDuplicates(null);
    setPendingNewContact(null);
    const updatedSteps = {
      ...processingSteps,
      duplicateCheck: 'success'
    };
    setProcessingSteps(updatedSteps);
    await runRemainingSteps(newContact, updatedSteps, performance.now(), false);
  };

  const handleDuplicateUpdateExisting = async (updatedContact) => {
    setDuplicates(null);
    setPendingNewContact(null);
    const updatedSteps = {
      ...processingSteps,
      duplicateCheck: 'success'
    };
    setProcessingSteps(updatedSteps);
    await runRemainingSteps(updatedContact, updatedSteps, performance.now(), true);
  };

  const handleDuplicateMerge = async (mergedContact) => {
    setDuplicates(null);
    setPendingNewContact(null);
    const updatedSteps = {
      ...processingSteps,
      duplicateCheck: 'success'
    };
    setProcessingSteps(updatedSteps);
    await runRemainingSteps(mergedContact, updatedSteps, performance.now(), true);
  };

  const handleDiscard = () => {
    setScannedData(null);
    setPreviewUrl(null);
    setPage('scan');
  };

  const handleDeleteContact = async (id) => {
    await deleteContactFromDB(id);
    setContacts(prev => prev.filter(c => c.id !== id));
    if (!isOffline && isFirebaseConfigured()) {
      deleteContactFromFirebase(id);
    }
  };

  const handleUpdateContact = async (updated) => {
    await saveContactToDB(updated);
    setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
    if (!isOffline && isFirebaseConfigured()) {
      saveContactToFirebase(updated);
    }
  };

  const handleRetryContactDispatch = async (contact) => {
    if (isOffline) {
      addToast('Cannot retry sending while offline.', 'warning');
      return;
    }
    
    addToast('Retrying dispatch...', 'info');
    
    if (contact.zohoStatus === 'failed' || contact.zohoStatus === 'queued') {
      await enqueueAction('SYNC_ZOHO', { contactId: contact.id, contactData: contact });
    }
    if (contact.emailStatus === 'failed' || contact.emailStatus === 'queued') {
      await enqueueAction('SEND_EMAIL', {
        contactId: contact.id,
        email: contact.email,
        subject: fillTemplate(emailSubject, contact),
        message: contact.emailMessage
      });
    }
    if (contact.whatsappStatus === 'failed' || contact.whatsappStatus === 'queued') {
      await enqueueAction('SEND_WHATSAPP', { contactId: contact.id });
    }
    
    setIsSyncing(true);
    await processQueue(async (updatedContacts) => {
      if (updatedContacts) {
        setContacts(prepareContacts(updatedContacts).sort((a, b) => b.id - a.id));
      } else {
        const dbContacts = await getContactsFromDB();
        setContacts(prepareContacts(dbContacts).sort((a, b) => b.id - a.id));
      }
      await updateQueueCount();
      addToast('Retry completed!', 'success');
    }, handleSyncResult);
    setIsSyncing(false);
  };

  const handleCreateFolder = async (name) => {
    const newFolder = {
      id: 'folder_' + Date.now(),
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveFolderToDB(newFolder);
    setFolders(prev => [...prev, newFolder]);
    addToast(`Folder "${name}" created`, 'success');
    return newFolder;
  };

  const handleUpdateFolder = async (id, name) => {
    const folder = folders.find(f => f.id === id);
    if (!folder) return;
    const updated = {
      ...folder,
      name,
      updatedAt: new Date().toISOString()
    };
    await saveFolderToDB(updated);
    setFolders(prev => prev.map(f => f.id === id ? updated : f));
    addToast('Folder name updated', 'success');
  };

  const handleDeleteFolder = async (id) => {
    await deleteFolderFromDB(id);
    setFolders(prev => prev.filter(f => f.id !== id));
    
    // For contacts inside this folder, reset folderId to null (meaning Uncategorized)
    const contactsInFolder = contacts.filter(c => c.folderId === id);
    for (const contact of contactsInFolder) {
      const updatedContact = { ...contact, folderId: null };
      await saveContactToDB(updatedContact);
    }
    setContacts(prev => prev.map(c => c.folderId === id ? { ...c, folderId: null } : c));
    addToast('Folder deleted. Contacts moved to Uncategorized', 'success');
  };

  const PAGE_TITLE = {
    scan: 'CardConnect AI',
    review: 'Review Contact',
    contacts: 'All Contacts',
    folders: 'Folders',
  };

  if (showSplash) {
    return (
      <div className="splash-screen">
        <div className="splash-logo">CC</div>
        <h1 style={{color: 'white', marginTop: 16}}>CardConnect AI</h1>
        <div className="spinner splash-spinner" />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-logo">
          <div className="logo-icon">
            <span className="material-icons" style={{ fontSize: 20 }}>document_scanner</span>
          </div>
          {PAGE_TITLE[page]}
        </div>
        
        <div 
          className="network-status" 
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
          onClick={handleManualSync}
          title="Click to manually sync"
        >
          {isSyncing && (
            <span className="material-icons syncing-icon" style={{ color: 'var(--primary)', fontSize: 18 }}>sync</span>
          )}
          {queueCount > 0 && (
            <div className="queue-badge">{queueCount} pending</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: isOffline ? 'var(--warning)' : 'var(--success)' }}>
            <span className="material-icons" style={{ fontSize: 16 }}>
              {isOffline ? 'wifi_off' : 'wifi'}
            </span>
            {isOffline ? 'Offline' : 'Online'}
          </div>
        </div>
      </header>

          {isOffline && (
            <div className="offline-banner">
              You are offline. Actions will be saved and synced automatically when you reconnect.
            </div>
          )}

          {showInstallPrompt && (
            <div className="install-prompt">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="app-icon-mini">CC</div>
                <div>
                  <h4 style={{ margin: 0, fontSize: 14 }}>Install CardConnect AI</h4>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Add to home screen for offline access</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setShowInstallPrompt(false)}>Later</button>
                <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={handleInstallClick}>Install</button>
              </div>
            </div>
          )}

          <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {page === 'scan' && (
              <ScanScreen onCardScanned={handleCardScanned} key="scan" />
            )}
            {page === 'review' && (
              <ReviewScreen
                scannedData={scannedData}
                previewUrl={previewUrl}
                onSave={handleSaveContact}
                onDiscard={handleDiscard}
                isOffline={isOffline}
                isProcessing={isProcessing}
                processingSteps={processingSteps}
                failedStep={failedStep}
                folders={folders}
                onCreateFolder={handleCreateFolder}
                key="review"
              />
            )}
            {page === 'contacts' && (
              <ContactsScreen
                contacts={contacts}
                onDelete={handleDeleteContact}
                onUpdate={handleUpdateContact}
                onGoToScan={() => setPage('scan')}
                onRetryDispatch={handleRetryContactDispatch}
                key="contacts"
              />
            )}
            {page === 'folders' && (
              <FoldersScreen
                contacts={contacts}
                folders={folders}
                onCreateFolder={handleCreateFolder}
                onUpdateFolder={handleUpdateFolder}
                onDeleteFolder={handleDeleteFolder}
                onDeleteContact={handleDeleteContact}
                onUpdateContact={handleUpdateContact}
                onRetryDispatch={handleRetryContactDispatch}
                key="folders"
              />
            )}
          </main>

          {duplicates && pendingNewContact && (
            <DuplicateModal
              duplicates={duplicates}
              newContact={pendingNewContact}
              onCancel={handleDuplicateCancel}
              onSaveAsNew={handleDuplicateSaveAsNew}
              onUpdateExisting={handleDuplicateUpdateExisting}
              onMerge={handleDuplicateMerge}
            />
          )}

          <BottomNav activePage={page} setPage={setPage} />
        </div>
  );
}

export default App;
