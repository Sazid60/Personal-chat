import { Socket } from 'socket.io-client';

export class WebRTCManager {
  private socket: Socket;
  public peerConnection: RTCPeerConnection | null = null;
  public localStream: MediaStream | null = null;
  public remoteStream: MediaStream | null = null;
  public currentCallType: 'audio' | 'video' | null = null;
  public targetUserId: number | null = null;

  public onLocalStreamCallback: ((stream: MediaStream, callType: 'audio' | 'video') => void) | null = null;
  public onRemoteStreamCallback: ((stream: MediaStream, callType: 'audio' | 'video') => void) | null = null;
  public onCallEndCallback: ((callType: 'audio' | 'video' | null) => void) | null = null;

  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  constructor(socket: Socket) {
    this.socket = socket;
  }

  public pendingOffer: any = null;

  async startCall(targetUserId: number, callType: 'audio' | 'video') {
    this.targetUserId = targetUserId;
    this.currentCallType = callType;

    try {
      await this.initLocalStream(callType);
      this.createPeerConnection();

      this.localStream?.getTracks().forEach((track) => {
        this.peerConnection?.addTrack(track, this.localStream!);
      });

      const offer = await this.peerConnection!.createOffer();
      await this.peerConnection!.setLocalDescription(offer);

      this.socket.emit('webrtc_signal', {
        targetUserId: this.targetUserId,
        callType,
        signal: { type: 'offer', sdp: offer }
      });
    } catch (err) {
      console.error('Failed to start call:', err);
      this.endCall(true);
      throw err;
    }
  }

  async answerCall(callerId: number, callType: 'audio' | 'video') {
    this.targetUserId = callerId;
    this.currentCallType = callType;

    await this.initLocalStream(callType);
    this.createPeerConnection();

    this.localStream?.getTracks().forEach((track) => {
      this.peerConnection?.addTrack(track, this.localStream!);
    });

    if (this.pendingOffer) {
      await this.processOffer(this.pendingOffer);
      this.pendingOffer = null;
    }
  }

  private async processOffer(signal: any) {
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.socket.emit('webrtc_signal', {
        targetUserId: this.targetUserId,
        callType: this.currentCallType,
        signal: { type: 'answer', sdp: answer }
      });
    } catch (err) {
      console.error('Error processing offer:', err);
    }
  }

  async handleIncomingSignal(data: { senderId: number; signal: any; callType?: 'audio' | 'video' }) {
    const { senderId, signal, callType } = data;
    this.targetUserId = senderId;
    if (callType) this.currentCallType = callType;

    if (signal.type === 'offer') {
      if (this.localStream && this.peerConnection) {
        await this.processOffer(signal);
      } else {
        this.pendingOffer = signal;
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

  async initLocalStream(callType: 'audio' | 'video') {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: callType === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (this.onLocalStreamCallback) {
      this.onLocalStreamCallback(this.localStream, callType);
    }
  }

  private createPeerConnection() {
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
      if (this.onRemoteStreamCallback && this.currentCallType) {
        this.onRemoteStreamCallback(this.remoteStream, this.currentCallType);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(this.peerConnection?.connectionState || '')) {
        this.endCall(false);
      }
    };
  }

  toggleAudio(enabled?: boolean): boolean {
    if (!this.localStream) return false;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = enabled !== undefined ? enabled : !track.enabled;
    });
    return this.isAudioEnabled();
  }

  isAudioEnabled(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    return track ? track.enabled : false;
  }

  toggleVideo(enabled?: boolean): boolean {
    if (!this.localStream) return false;
    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = enabled !== undefined ? enabled : !track.enabled;
    });
    return this.isVideoEnabled();
  }

  isVideoEnabled(): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    return track ? track.enabled : false;
  }

  async toggleScreenShare(): Promise<boolean> {
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

  private isEnding = false;

  endCall(notifySocket: boolean = true) {
    if (this.isEnding) return;
    this.isEnding = true;
    try {
      if (this.peerConnection) {
        this.peerConnection.onicecandidate = null;
        this.peerConnection.ontrack = null;
        this.peerConnection.onconnectionstatechange = null;
        this.peerConnection.close();
        this.peerConnection = null;
      }

      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          try { track.stop(); } catch (_) {}
        });
        this.localStream = null;
      }

      this.remoteStream = null;
      this.pendingOffer = null;
      const prevType = this.currentCallType;
      const prevTarget = this.targetUserId;
      this.currentCallType = null;
      this.targetUserId = null;

      if (notifySocket && prevTarget) {
        this.socket.emit('call_end', { targetUserId: prevTarget });
      }
    } finally {
      this.isEnding = false;
    }
  }
}

