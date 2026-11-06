// End-to-End Encryption Engine using Web Crypto API (AES-GCM-256 + PBKDF2)
class E2EEManager {
  constructor() {
    this.cryptoKey = null;
    this.keyDerived = false;
  }

  // Derive AES-GCM 256-bit key from user passphrase and roomId
  async setPassphrase(passphrase, roomId) {
    const enc = new TextEncoder();
    const passphraseBytes = enc.encode(passphrase);
    const saltBytes = enc.encode(`salt_${roomId}_e2ee_v1`);

    // Import passphrase as base key material
    const baseKey = await window.crypto.subtle.importKey(
      'raw',
      passphraseBytes,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // Derive AES-GCM key
    this.cryptoKey = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    this.keyDerived = true;
    return true;
  }

  // Encrypt text string
  async encryptText(plainText) {
    if (!this.cryptoKey) throw new Error('E2EE key not initialized');
    const enc = new TextEncoder();
    const encoded = enc.encode(plainText);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.cryptoKey,
      encoded
    );

    return {
      iv: this.bufferToBase64(iv),
      data: this.bufferToBase64(cipherBuffer)
    };
  }

  // Decrypt text string
  async decryptText(encryptedObj) {
    if (!this.cryptoKey) throw new Error('E2EE key not initialized');
    const iv = this.base64ToBuffer(encryptedObj.iv);
    const cipherBuffer = this.base64ToBuffer(encryptedObj.data);

    try {
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        this.cryptoKey,
        cipherBuffer
      );
      const dec = new TextDecoder();
      return dec.decode(decryptedBuffer);
    } catch (err) {
      console.error('Decryption failed. Invalid key or corrupted data.', err);
      return '[Decryption failed: Incorrect Room Secret or Corrupted Data]';
    }
  }

  // Encrypt binary ArrayBuffer (photos, audio, video, files, gifs)
  async encryptBinary(arrayBuffer) {
    if (!this.cryptoKey) throw new Error('E2EE key not initialized');
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.cryptoKey,
      arrayBuffer
    );

    return {
      iv: this.bufferToBase64(iv),
      data: this.bufferToBase64(cipherBuffer)
    };
  }

  // Decrypt binary ArrayBuffer
  async decryptBinary(encryptedObj) {
    if (!this.cryptoKey) throw new Error('E2EE key not initialized');
    const iv = this.base64ToBuffer(encryptedObj.iv);
    const cipherBuffer = this.base64ToBuffer(encryptedObj.data);

    try {
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        this.cryptoKey,
        cipherBuffer
      );
      return decryptedBuffer;
    } catch (err) {
      console.error('Binary decryption failed:', err);
      throw new Error('Could not decrypt binary payload');
    }
  }

  bufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  base64ToBuffer(base64) {
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

window.e2ee = new E2EEManager();

