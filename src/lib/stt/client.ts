// 브라우저 STT 클라이언트 — Fly.io STT 서버와 WebSocket 통신
// 마이크 → 16kHz PCM → WS → 실시간 전사 이벤트

export interface STTFinal {
  seg_id: number;
  text: string;
  start_ms: number;
  duration_ms: number;
}

export interface STTHandle {
  stop: () => Promise<void>;
  cleanup: () => void;
}

export interface STTCallbacks {
  onReady?: () => void;
  onPartial?: (text: string) => void;
  onFinal?: (seg: STTFinal) => void;
  onError?: (err: string) => void;
  onClose?: () => void;
}

export async function startSTT(
  wsUrl: string,
  callbacks: STTCallbacks,
): Promise<STTHandle> {
  // 1) 마이크 권한
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  // 2) AudioContext + Worklet
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AC({ sampleRate: 16000 });
  await audioCtx.audioWorklet.addModule('/pcm-worklet.js');

  const source = audioCtx.createMediaStreamSource(micStream);
  const workletNode = new AudioWorkletNode(audioCtx, 'pcm-sender');

  // 3) WebSocket 연결
  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    source.connect(workletNode);
    workletNode.port.onmessage = (e) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(e.data as ArrayBuffer);
      }
    };
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data as string);
      if (msg.type === 'ready') callbacks.onReady?.();
      else if (msg.type === 'partial') callbacks.onPartial?.(msg.text);
      else if (msg.type === 'final') callbacks.onFinal?.(msg as STTFinal);
      else if (msg.type === 'error') callbacks.onError?.(msg.error);
    } catch {
      // ignore
    }
  };

  ws.onclose = () => callbacks.onClose?.();
  ws.onerror = () => callbacks.onError?.('WebSocket 오류');

  const cleanup = () => {
    try { workletNode.disconnect(); } catch {}
    try { audioCtx.close(); } catch {}
    micStream.getTracks().forEach((t) => t.stop());
    try { ws.close(); } catch {}
  };

  const stop = async () => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'stop' }));
      } catch {}
    }
    // 잠깐 대기해서 남은 final 받고
    await new Promise((r) => setTimeout(r, 300));
    cleanup();
  };

  return { stop, cleanup };
}
