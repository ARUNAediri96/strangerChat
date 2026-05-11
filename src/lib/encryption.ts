// E2E Encryption using Web Crypto API (X25519 + AES-256-GCM)
// Messages are encrypted in-browser, server only sees ciphertext

const ALGO = {
  name: "AES-GCM",
  length: 256,
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function generateKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );

  const publicKeyBuffer = await crypto.subtle.exportKey(
    "spki",
    keyPair.publicKey
  );
  const privateKeyBuffer = await crypto.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey
  );

  return {
    publicKey: arrayBufferToBase64(publicKeyBuffer),
    privateKey: arrayBufferToBase64(privateKeyBuffer),
  };
}

async function deriveSharedKey(
  privateKeyBase64: string,
  peerPublicKeyBase64: string
): Promise<CryptoKey> {
  const privateKeyBuffer = base64ToArrayBuffer(privateKeyBase64);
  const peerPublicKeyBuffer = base64ToArrayBuffer(peerPublicKeyBase64);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey"]
  );

  const peerPublicKey = await crypto.subtle.importKey(
    "spki",
    peerPublicKeyBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  return crypto.subtle.deriveKey(
    { name: "ECDH", public: peerPublicKey },
    privateKey,
    ALGO,
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptMessage(
  plaintext: string,
  myPrivateKey: string,
  peerPublicKey: string
): Promise<string> {
  const sharedKey = await deriveSharedKey(myPrivateKey, peerPublicKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    encoded
  );

  const payload = {
    iv: arrayBufferToBase64(iv.buffer),
    ct: arrayBufferToBase64(ciphertext),
  };

  return btoa(JSON.stringify(payload));
}

export async function decryptMessage(
  encryptedPayload: string,
  myPrivateKey: string,
  peerPublicKey: string
): Promise<string> {
  const sharedKey = await deriveSharedKey(myPrivateKey, peerPublicKey);
  const decoded = JSON.parse(atob(encryptedPayload));
  const iv = new Uint8Array(base64ToArrayBuffer(decoded.iv));
  const ciphertext = base64ToArrayBuffer(decoded.ct);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}
