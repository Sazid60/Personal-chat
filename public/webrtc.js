// WebRTC Manager for 1-on-1 Audio and Video Calls by User ID
class WebRTCManager {
  constructor(socket) {
    this.socket = socket;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.currentCallType = null; // 'audio' | 'video'
    this.targetUserId = null;
    this.isInitiator = false;

    this.onLocalStreamCallback = null;
    this.onRemoteStreamCallback = null;
    this.onCallEndCallback = null;

    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };
  }

  async startCall(targetUserId, callType) {
    this.targetUserId = targetUserId;
    this.currentCallType = callType;
    this.isInitiator = true;

    try {
      await this.initLocalStream(callType);
      this.createPeerConnection();

      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this.socket.emit('webrtc_signal', {
        targetUserId: this.targetUserId,
        callType,
        signal: { type: 'offer', sdp: offer }
      });
    } catch (err) {
      console.error('Failed to start call:', err);
      this.endCall();
      throw err;
    }
  }

  async handleIncomingSignal(data) {
    const { senderId, signal, callType } = data;
    this.targetUserId = senderId;
    if (callType) this.currentCallType = callType;

    if (signal.type === 'offer') {
      try {
        if (!this.localStream) {
          await this.initLocalStream(this.currentCallType || 'audio');
        }
        this.createPeerConnection();

        this.localStream.getTracks().forEach((track) => {
          this.peerConnection.addTrack(track, this.localStream);
        });

        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        this.socket.emit('webrtc_signal', {
          targetUserId: this.targetUserId,
          callType: this.currentCallType,
          signal: { type: 'answer', sdp: answer }
        });
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    } else if (signal.type === 'answer') {
      try {
        if (this.peerConnection) {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        }
      } catch (err) {
        console.error('Error handling answer:', err);
      }
    } else if (signal.type === 'candidate') {
      try {
        if (this.peerConnection && signal.candidate) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    }
  }

  async initLocalStream(callType) {
    const constraints = {
      audio: true,
      video: callType === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (this.onLocalStreamCallback) {
      this.onLocalStreamCallback(this.localStream, callType);
    }
  }

  createPeerConnection() {
    if (this.peerConnection) return;

    this.peerConnection = new RTCPeerConnection(this.rtcConfig);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.targetUserId) {
        this.socket.emit('webrtc_signal', {
          targetUserId: this.targetUserId,
          signal: { type: 'candidate', candidate: event.candidate }
        });
      }
    };

    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(this.remoteStream, this.currentCallType);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(this.peerConnection?.connectionState)) {
        this.endCall(false);
      }
    };
  }

  toggleAudio(enabled) {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = enabled !== undefined ? enabled : !track.enabled;
    });
    return this.isAudioEnabled();
  }

  isAudioEnabled() {
    if (!this.localStream) return false;
    const track = this.localStream.getAudioTracks()[0];
    return track ? track.enabled : false;
  }

  toggleVideo(enabled) {
    if (!this.localStream) return;
    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = enabled !== undefined ? enabled : !track.enabled;
    });
    return this.isVideoEnabled();
  }

  isVideoEnabled() {
    if (!this.localStream) return false;
    const track = this.localStream.getVideoTracks()[0];
    return track ? track.enabled : false;
  }

  async toggleScreenShare() {
    if (!this.peerConnection) return false;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      const sender = this.peerConnection.getSenders().find((s) => s.track && s.track.kind === 'video');

      if (sender) {
        sender.replaceTrack(screenTrack);
      } else {
        this.peerConnection.addTrack(screenTrack, screenStream);
      }

      screenTrack.onended = () => {
        const camTrack = this.localStream?.getVideoTracks()[0];
        if (camTrack && sender) sender.replaceTrack(camTrack);
      };

      return true;
    } catch (err) {
      console.warn('Screen share canceled:', err);
      return false;
    }
  }

  endCall(notifySocket = true) {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    const prevType = this.currentCallType;
    const prevTarget = this.targetUserId;
    this.currentCallType = null;
    this.targetUserId = null;

    if (notifySocket && prevTarget) {
      this.socket.emit('call_end', { targetUserId: prevTarget });
    }

    if (this.onCallEndCallback) {
      this.onCallEndCallback(prevType);
    }
  }
}

window.WebRTCManager = WebRTCManager;
