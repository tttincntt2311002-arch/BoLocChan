/** 404 Not Found page */
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="container-main py-32 text-center">
      <p className="text-8xl font-bold text-gradient mb-4">404</p>
      <h2 className="mb-4">Trang không tìm thấy</h2>
      <p className="text-gray-400 mb-8">Trang bạn đang tìm kiếm không tồn tại.</p>
      <Link to="/" className="btn-primary">← Về trang chủ</Link>
    </div>
  )
}
