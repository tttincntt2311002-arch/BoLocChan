/**
 * Home Page – landing / hero section
 */
import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div className="container-main py-20 text-center">
      <div className="max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-primary-500/10 border border-primary-500/30 rounded-full px-4 py-1.5 text-primary-400 text-sm mb-6">
          🎓 Soulbound Token Certificate System
        </div>

        <h1 className="text-5xl font-bold mb-6 text-gradient leading-tight">
          Chứng nhận tham gia <br /> hoạt động ngoại khóa
        </h1>

        <p className="text-gray-400 text-lg mb-10 leading-relaxed">
          Hệ thống cấp phát và xác thực chứng nhận kỹ thuật số trên nền tảng Blockchain Ethereum Sepolia.
          Mỗi chứng nhận là một <strong className="text-white">Soulbound Token (SBT)</strong> – không thể chuyển nhượng, không thể giả mạo.
        </p>

        <div className="flex flex-wrap gap-4 justify-center mb-16">
          <Link to="/verify" className="btn-primary text-base px-6 py-3">
            🔍 Xác thực chứng nhận
          </Link>
          <Link to="/events" className="btn-outline text-base px-6 py-3">
            📋 Xem sự kiện
          </Link>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          {[
            { icon: '🔒', title: 'Không thể chuyển nhượng', desc: 'SBT gắn vĩnh viễn với ví của người nhận, đảm bảo tính xác thực.' },
            { icon: '⛓', title: 'Minh bạch trên Blockchain', desc: 'Mọi chứng nhận đều được ghi nhận trên Ethereum Sepolia, công khai và bất biến.' },
            { icon: '🌐', title: 'Metadata lưu trên IPFS', desc: 'Thông tin chứng nhận được lưu phi tập trung, không phụ thuộc server trung tâm.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="card">
              <div className="text-3xl mb-3">{icon}</div>
              <h3 className="font-semibold text-white mb-2">{title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
