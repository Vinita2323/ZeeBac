import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getSocket, connectSocket } from '../services/socket';
import useAuthStore from '../store/useAuthStore';
import { playOutgoingRing, playIncomingRing, playEndCallTone, stopRingtone } from '../utils/callSound';
import toast from 'react-hot-toast';

const CallContext = createContext(null);

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export function CallProvider({ children }) {
  const token = useAuthStore((s) => s.accessToken);
  const currentUser = useAuthStore((s) => s.currentUser);

  // Call States: 'idle' | 'calling' | 'ringing' | 'connected' | 'ended' | 'declined' | 'unavailable'
  const [callStatus, setCallStatus] = useState('idle');
  const [activePartner, setActivePartner] = useState(null); // { id, name, avatar, role }
  const [incomingCall, setIncomingCall] = useState(null); // { callId, callerId, callerRole, callerInfo, offer }
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const queuedCandidatesRef = useRef([]);
  const activeCallDataRef = useRef(null); // Keep sync ref for event callbacks

  // Ensure persistent socket connection for calls when authenticated
  useEffect(() => {
    if (token) {
      connectSocket(token);
    }
  }, [token]);

  // Clean up media tracks and peer connection
  const cleanupMedia = () => {
    stopRingtone();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      localStreamRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    queuedCandidatesRef.current = [];
    setIsMuted(false);
  };

  // Call duration counter
  useEffect(() => {
    let timer = null;
    if (callStatus === 'connected') {
      timer = setInterval(() => {
        setCallDuration((d) => d + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callStatus]);

  // Setup PeerConnection factory
  const createPeerConnection = (targetUserId, targetUserRole) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const socket = getSocket();
        if (socket) {
          socket.emit('call:ice-candidate', {
            targetUserId,
            targetUserRole,
            candidate: event.candidate,
          });
        }
      }
    };

    pc.ontrack = (event) => {
      if (remoteAudioRef.current && event.streams && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.play().catch((err) => {
          console.warn('Audio autoPlay prevented:', err);
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall();
      }
    };

    pcRef.current = pc;
    return pc;
  };

  // Socket Call Event Listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // 1. Recipient receives incoming call
    const handleIncomingCall = (data) => {
      // If already on a call, automatically reject with busy
      if (callStatus !== 'idle') {
        socket.emit('call:reject', {
          callId: data.callId,
          callerId: data.callerId,
          callerRole: data.callerRole,
          reason: 'busy',
        });
        return;
      }

      setIncomingCall(data);
      playIncomingRing();
    };

    // 2. Caller receives call answered event
    const handleCallAnswered = async (data) => {
      stopRingtone();
      if (!pcRef.current) return;

      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        setCallStatus('connected');

        // Flush any queued ICE candidates
        if (queuedCandidatesRef.current.length > 0) {
          for (const cand of queuedCandidatesRef.current) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
          }
          queuedCandidatesRef.current = [];
        }
      } catch (err) {
        console.error('Failed to set remote description on answer:', err);
      }
    };

    // 3. Caller receives call rejected
    const handleCallRejected = ({ reason }) => {
      stopRingtone();
      playEndCallTone();
      cleanupMedia();
      setCallStatus('idle');
      setActivePartner(null);
      setIncomingCall(null);
      activeCallDataRef.current = null;
      toast.error(reason === 'busy' ? 'User is on another call' : 'Call declined');
    };

    // 4. Caller notified that target is offline / unavailable
    const handleCallUnavailable = ({ message }) => {
      stopRingtone();
      playEndCallTone();
      cleanupMedia();
      setCallStatus('idle');
      setActivePartner(null);
      setIncomingCall(null);
      activeCallDataRef.current = null;
      toast.error(message || 'User is currently offline');
    };

    // 5. Receiving ICE candidates
    const handleIceCandidate = async ({ candidate }) => {
      if (!candidate) return;
      if (pcRef.current && pcRef.current.remoteDescription) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Failed adding received ICE candidate:', err);
        }
      } else {
        queuedCandidatesRef.current.push(candidate);
      }
    };

    // 6. Call ended by peer
    const handleCallEnded = () => {
      stopRingtone();
      playEndCallTone();
      cleanupMedia();
      setCallStatus('idle');
      setActivePartner(null);
      setIncomingCall(null);
      activeCallDataRef.current = null;
    };

    socket.on('call:incoming', handleIncomingCall);
    socket.on('call:answered', handleCallAnswered);
    socket.on('call:rejected', handleCallRejected);
    socket.on('call:unavailable', handleCallUnavailable);
    socket.on('call:ice-candidate', handleIceCandidate);
    socket.on('call:ended', handleCallEnded);

    return () => {
      socket.off('call:incoming', handleIncomingCall);
      socket.off('call:answered', handleCallAnswered);
      socket.off('call:rejected', handleCallRejected);
      socket.off('call:unavailable', handleCallUnavailable);
      socket.off('call:ice-candidate', handleIceCandidate);
      socket.off('call:ended', handleCallEnded);
    };
  }, [token, callStatus]);

  // Start Outgoing Call
  const startCall = async ({ targetUserId, targetUserRole, partnerName, partnerAvatar, partnerRole, conversationId }) => {
    try {
      const socket = getSocket();
      if (!socket || !socket.connected) {
        toast.error('Not connected to chat server. Please refresh.');
        return;
      }

      // Request microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      localStreamRef.current = stream;

      // Create WebRTC Peer Connection
      const pc = createPeerConnection(targetUserId, targetUserRole);
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Create Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const callerName = currentUser?.storeName || currentUser?.name || 'Zeebac User';
      const callerAvatar = currentUser?.profilePic || currentUser?.profileImage || null;
      const callerRole = currentUser?.role === 'vendor' ? 'Partner Store' : 'Customer';

      const myId = currentUser?._id || currentUser?.id || 'user';
      const callId = `${myId}_${targetUserId}_${Date.now()}`;

      setActivePartner({
        callId,
        id: targetUserId,
        role: targetUserRole,
        name: partnerName,
        avatar: partnerAvatar,
        roleLabel: partnerRole || (targetUserRole === 'vendor' ? 'Partner Store' : 'Customer'),
        conversationId,
      });
      activeCallDataRef.current = { callId, targetUserId, targetUserRole, conversationId };

      setCallStatus('calling');
      playOutgoingRing();

      // Emit to server
      socket.emit('call:initiate', {
        callId,
        targetUserId,
        targetUserRole,
        conversationId,
        offer,
        callerInfo: {
          name: callerName,
          avatar: callerAvatar,
          role: callerRole,
        },
      });
    } catch (err) {
      console.error('Failed to start call:', err);
      cleanupMedia();
      setCallStatus('idle');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error('Microphone permission denied. Please allow microphone access to make calls.');
      } else {
        toast.error('Could not access microphone: ' + err.message);
      }
    }
  };

  // Accept Incoming Call
  const acceptCall = async () => {
    if (!incomingCall) return;

    try {
      stopRingtone();
      const socket = getSocket();
      const { callerId, callerRole, callerInfo, offer, callId } = incomingCall;

      // Request microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      localStreamRef.current = stream;

      // Create Peer Connection
      const pc = createPeerConnection(callerId, callerRole);
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Set Remote Description from caller's offer
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Flush queued candidates if any arrived early
      if (queuedCandidatesRef.current.length > 0) {
        for (const cand of queuedCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        }
        queuedCandidatesRef.current = [];
      }

      // Create & Set Answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Emit answer to server
      socket.emit('call:answer', {
        callId,
        callerId,
        callerRole,
        answer,
      });

      setActivePartner({
        callId,
        id: callerId,
        role: callerRole,
        name: callerInfo?.name || 'Zeebac User',
        avatar: callerInfo?.avatar || null,
        roleLabel: callerInfo?.role || (callerRole === 'vendor' ? 'Partner Store' : 'Customer'),
        conversationId: incomingCall.conversationId,
      });
      activeCallDataRef.current = {
        callId,
        targetUserId: callerId,
        targetUserRole: callerRole,
        conversationId: incomingCall.conversationId,
      };

      setIncomingCall(null);
      setCallStatus('connected');
    } catch (err) {
      console.error('Failed to accept call:', err);
      cleanupMedia();
      setIncomingCall(null);
      setCallStatus('idle');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error('Microphone permission denied. Please allow microphone access to take calls.');
      } else {
        toast.error('Could not connect call: ' + err.message);
      }
    }
  };

  // Reject Incoming Call
  const rejectCall = (reason = 'declined') => {
    if (!incomingCall) return;
    stopRingtone();
    const socket = getSocket();
    if (socket) {
      socket.emit('call:reject', {
        callId: incomingCall.callId,
        callerId: incomingCall.callerId,
        callerRole: incomingCall.callerRole,
        reason,
      });
    }
    setIncomingCall(null);
  };

  // End Active Call (Immediate clean termination)
  const endCall = () => {
    stopRingtone();
    playEndCallTone();

    const socket = getSocket();
    const partner = activeCallDataRef.current || activePartner;

    if (socket) {
      socket.emit('call:end', {
        callId: partner?.callId,
        targetUserId: partner?.targetUserId || partner?.id,
        targetUserRole: partner?.targetUserRole || partner?.role,
        conversationId: partner?.conversationId,
      });
    }

    cleanupMedia();
    setCallStatus('idle');
    setActivePartner(null);
    setIncomingCall(null);
    activeCallDataRef.current = null;
  };

  // Toggle Mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const nextMuted = !isMuted;
        audioTracks[0].enabled = !nextMuted;
        setIsMuted(nextMuted);
      }
    }
  };

  // Toggle Speaker
  const toggleSpeaker = () => {
    if (remoteAudioRef.current) {
      const nextSpeaker = !isSpeakerOn;
      remoteAudioRef.current.volume = nextSpeaker ? 1.0 : 0.2;
      setIsSpeakerOn(nextSpeaker);
    }
  };

  return (
    <CallContext.Provider
      value={{
        callStatus,
        activePartner,
        incomingCall,
        callDuration,
        isMuted,
        isSpeakerOn,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleSpeaker,
      }}
    >
      {children}
      {/* Hidden audio element for WebRTC remote audio playback */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
}
