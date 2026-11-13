import { Link } from 'react-router-dom'
import useAuthStore from '@/hooks/useAuthStore'
import useApiData from '@/hooks/useApiData'
import { allPages } from '@/utils/api'
import { Badge, DataState, Heading, dateText } from '@/components/DataUI'

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const state = useApiData(async () => {
    const [events, certificates] = await Promise.all([
      allPages('/events', { managed_only: true }),
      allPages('/certificates'),
    ])
    return { events, certificates }
  }, [user.id])
  const { data } = state
  return (
    <>
      <Heading
        title={`Xin chào, ${user.full_name}`}
        description="Dữ liệu từ không gian tổ chức của bạn."
        actions={
          <Link to="/events/new" className="button button-primary">
            Tạo sự kiện
          </Link>
        }
      />
      <DataState {...state} />
      {data && (
        <>
          <div className="stats-grid">
            {[
              ['Sự kiện quản lý', data.events.length],
              [
                'Chứng nhận đã cấp',
                data.certificates.filter((c) => c.status === 'issued').length,
              ],
              [
                'Đang chờ xác nhận',
                data.certificates.filter((c) => c.status === 'pending').length,
              ],
              [
                'Giao dịch thất bại',
                data.certificates.filter((c) => c.status === 'failed').length,
              ],
            ].map(([label, value]) => (
              <div className="stat-card" key={label}>
                <p>{label}</p>
                <div className="stat-value">{value}</div>
              </div>
            ))}
          </div>
          <section className="panel data-panel">
            <h2>Sự kiện gần đây</h2>
            {data.events.length === 0 && (
              <p>Chưa có sự kiện. Hãy tạo tổ chức và sự kiện đầu tiên.</p>
            )}
            {data.events
              .slice(-5)
              .reverse()
              .map((event) => (
                <div className="detail-row" key={event.id}>
                  <Link to="/events">{event.name}</Link>
                  <span>{dateText(event.start_date)}</span>
                  <Badge status={event.status} />
                </div>
              ))}
          </section>
          <section className="panel data-panel">
            <h2>Hoạt động cấp chứng nhận</h2>
            {data.certificates.length === 0 && <p>Chưa có chứng nhận.</p>}
            {data.certificates
              .slice(-8)
              .reverse()
              .map((c) => (
                <div className="detail-row" key={c.id}>
                  <Link to="/certificates">
                    {data.events.find((e) => e.id === c.event_id)?.name ||
                      c.event_id}
                  </Link>
                  <span>Token {c.token_id ?? '—'}</span>
                  <Badge status={c.status} />
                </div>
              ))}
          </section>
        </>
      )}
    </>
  )
}
