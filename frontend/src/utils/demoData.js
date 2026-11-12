import { Award, CalendarDays, Clock3, Users } from 'lucide-react'

// Local UI fixtures. Replace this module with API services when the backend is ready.
export const stats = [
  { label: 'Tổng sự kiện', value: '24', change: '12.8%', icon: CalendarDays, tone: 'purple' },
  { label: 'Người tham gia', value: '1,842', change: '8.2%', icon: Users, tone: 'blue' },
  { label: 'Chứng nhận đã cấp', value: '1,284', change: '18.4%', icon: Award, tone: 'green' },
  { label: 'Chờ xử lý', value: '08', change: '2.1%', icon: Clock3, tone: 'orange' },
]

export const events = [
  { name: 'Web3 Developer Bootcamp 2025', description: 'Chương trình đào tạo phát triển ứng dụng Web3 chuyên sâu.', date: '12 – 15 Tháng 11, 2025', day: '12', month: 'TH 11', participants: 248, issued: 182, status: 'Đang diễn ra' },
  { name: 'Blockchain Innovation Summit', description: 'Kết nối cộng đồng và chia sẻ những đột phá blockchain mới.', date: '20 Tháng 11, 2025', day: '20', month: 'TH 11', participants: 412, issued: 0, status: 'Sắp diễn ra' },
  { name: 'Product Design Workshop', description: 'Workshop thực hành về thiết kế sản phẩm số lấy người dùng làm trung tâm.', date: '05 Tháng 11, 2025', day: '05', month: 'TH 11', participants: 86, issued: 86, status: 'Đã kết thúc' },
  { name: 'Open Source Contributors Day', description: 'Tôn vinh đóng góp cho hệ sinh thái mã nguồn mở.', date: '28 Tháng 11, 2025', day: '28', month: 'TH 11', participants: 156, issued: 0, status: 'Sắp diễn ra' },
]

export const activities = [
  { name: 'Alexandra Lee', email: 'alex.lee@email.com', initials: 'AL', color: 'lavender', action: 'Đã nhận chứng nhận', event: 'Web3 Developer Bootcamp', status: 'Đã cấp', time: '2 phút trước' },
  { name: 'Thomas Kim', email: 'thomas.k@email.com', initials: 'TK', color: 'peach', action: 'Đã đăng ký tham gia', event: 'Blockchain Innovation Summit', status: 'Đang xử lý', time: '18 phút trước' },
  { name: 'Maya Nguyen', email: 'maya.n@email.com', initials: 'MN', color: 'mint', action: 'Đã nhận chứng nhận', event: 'Product Design Workshop', status: 'Đã cấp', time: '1 giờ trước' },
  { name: 'Daniel Park', email: 'daniel.p@email.com', initials: 'DP', color: 'blue', action: 'Đã đăng ký tham gia', event: 'Web3 Developer Bootcamp', status: 'Đang xử lý', time: '3 giờ trước' },
]

export const certificates = [
  { name: 'Alexandra Lee', email: 'alex.lee@email.com', initials: 'AL', color: 'lavender', event: 'Web3 Developer Bootcamp', token: 'SC-0842', issued: '12 Th 11, 2025', status: 'Đã cấp' },
  { name: 'Thomas Kim', email: 'thomas.k@email.com', initials: 'TK', color: 'peach', event: 'Blockchain Innovation Summit', token: 'SC-0841', issued: '11 Th 11, 2025', status: 'Đang xử lý' },
  { name: 'Maya Nguyen', email: 'maya.n@email.com', initials: 'MN', color: 'mint', event: 'Product Design Workshop', token: 'SC-0840', issued: '10 Th 11, 2025', status: 'Đã cấp' },
  { name: 'Daniel Park', email: 'daniel.p@email.com', initials: 'DP', color: 'blue', event: 'Web3 Developer Bootcamp', token: 'SC-0839', issued: '09 Th 11, 2025', status: 'Đang xử lý' },
  { name: 'Jamie Tran', email: 'jamie.t@email.com', initials: 'JT', color: 'peach', event: 'Open Source Contributors Day', token: 'SC-0838', issued: '08 Th 11, 2025', status: 'Đã cấp' },
]
