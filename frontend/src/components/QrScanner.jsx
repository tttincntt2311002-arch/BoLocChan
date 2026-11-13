import { useEffect, useRef, useState } from 'react'
import { DataState } from './DataUI'
import { parseCertificateQr } from '@/utils/certificateLinks'

export default function QrScanner({ onScan }) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const video = useRef(null),
    stream = useRef(null),
    controls = useRef(null),
    generation = useRef(0)
  function stop() {
    generation.current++
    controls.current?.stop()
    controls.current = null
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    if (video.current) video.current.srcObject = null
    setScanning(false)
  }
  useEffect(() => {
    const active = { stream, controls, generation }
    return () => {
      active.generation.current++
      active.controls.current?.stop()
      active.stream.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])
  function decoded(text) {
    try {
      const identity = parseCertificateQr(text)
      stop()
      setError('')
      onScan(identity) // Extract identity only; never navigate to the QR's domain.
    } catch (err) {
      setError(err.message)
    }
  }
  async function start() {
    stop()
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera cần HTTPS hoặc localhost. Bạn có thể tải ảnh QR lên.')
      return
    }
    const version = generation.current
    setScanning(true)
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser')
      const source = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      if (version !== generation.current) {
        source.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = source
      const handle = await new BrowserQRCodeReader().decodeFromStream(
        source,
        video.current,
        (result) => {
          if (result && version === generation.current)
            decoded(result.getText())
        },
      )
      if (version !== generation.current) handle.stop()
      else controls.current = handle
    } catch (err) {
      if (version !== generation.current) return
      stop()
      setError(
        err.name === 'NotAllowedError'
          ? 'Bạn chưa cho phép truy cập camera. Hãy cấp quyền hoặc tải ảnh QR lên.'
          : err.name === 'NotFoundError'
            ? 'Không tìm thấy camera. Bạn có thể tải ảnh QR lên.'
            : 'Không mở được camera. Hãy kiểm tra quyền truy cập rồi thử lại.',
      )
    }
  }
  async function upload(event) {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    stop()
    setError('')
    if (file.size > 5 * 1024 * 1024) {
      setError('Ảnh QR phải nhỏ hơn 5 MB.')
      return
    }
    const version = generation.current,
      url = URL.createObjectURL(file)
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser')
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(url)
      if (version === generation.current) decoded(result.getText())
    } catch {
      if (version === generation.current)
        setError(
          'Không đọc được QR từ ảnh. Hãy dùng ảnh rõ nét chứa QR chứng nhận.',
        )
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  return (
    <section className="qr-scanner">
      <div className="certificate-actions">
        <button
          type="button"
          className="button button-outline"
          onClick={scanning ? stop : start}
        >
          {scanning ? 'Dừng camera' : 'Quét QR bằng camera'}
        </button>
        <label className="button button-outline qr-upload">
          Tải ảnh QR
          <input
            aria-label="Tải ảnh QR"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={upload}
          />
        </label>
      </div>
      <video
        ref={video}
        hidden={!scanning}
        muted
        playsInline
        aria-label="Camera quét QR"
      />
      <DataState error={error} />
    </section>
  )
}
