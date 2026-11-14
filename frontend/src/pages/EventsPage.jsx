import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import OrganizationBranding from '@/components/OrganizationBranding'
import useAuthStore from '@/hooks/useAuthStore'
import useApiData from '@/hooks/useApiData'
import api, { allPages } from '@/utils/api'
import { errorMessage } from '@/utils/errors'
import {
  Badge,
  DataState,
  Heading,
  dateText,
  statusText,
} from '@/components/DataUI'

const inputDate = (value) =>
  value
    ? new Date(
        new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16)
    : ''

function EventForm({ event, organizations, onSaved, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const values = Object.fromEntries(new FormData(e.currentTarget))
    try {
      values.start_date = new Date(values.start_date).toISOString()
      values.end_date = new Date(values.end_date).toISOString()
      if (new Date(values.end_date) <= new Date(values.start_date))
        throw new Error('Ngày kết thúc phải sau ngày bắt đầu.')
      if (event) {
        delete values.organization_id
        await api.patch(`/events/${event.id}`, values)
      } else await api.post('/events', values)
      toast.success('Đã lưu sự kiện')
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="panel data-panel">
      <h2>{event ? 'Chỉnh sửa sự kiện' : 'Tạo sự kiện mới'}</h2>
      <form className="modal-form" onSubmit={save}>
        <label>
          Tổ chức
          <select
            required
            name="organization_id"
            defaultValue={event?.organization_id}
            disabled={Boolean(event)}
          >
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tên sự kiện
          <input
            required
            minLength={3}
            maxLength={255}
            name="name"
            defaultValue={event?.name}
          />
        </label>
        <div className="form-two">
          <label>
            Ngày bắt đầu
            <input
              required
              type="datetime-local"
              name="start_date"
              defaultValue={inputDate(event?.start_date)}
            />
          </label>
          <label>
            Ngày kết thúc
            <input
              required
              type="datetime-local"
              name="end_date"
              defaultValue={inputDate(event?.end_date)}
            />
          </label>
        </div>
        <label>
          Địa điểm
          <input
            name="location"
            maxLength={255}
            defaultValue={event?.location}
          />
        </label>
        <label>
          Mô tả
          <textarea
            name="description"
            rows={3}
            defaultValue={event?.description}
          />
        </label>
        {!event && (
          <label>
            Trạng thái
            <select name="status">
              <option value="active">Đang mở</option>
              <option value="draft">Bản nháp</option>
            </select>
          </label>
        )}
        <DataState error={error} />
        <div className="modal-actions">
          <button
            type="button"
            className="button button-outline"
            onClick={onClose}
          >
            Hủy
          </button>
          <button
            disabled={busy || !organizations.length}
            className="button button-primary"
          >
            Lưu sự kiện
          </button>
        </div>
      </form>
    </section>
  )
}

function EventParticipants({ event, manager, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const state = useApiData(
    () => allPages(`/events/${event.id}/participants`),
    [event.id],
  )
  async function action(callback) {
    setBusy(true)
    setError('')
    try {
      await callback()
      await state.reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="panel data-panel">
      <h2>Người tham gia: {event.name}</h2>
      <button type="button" className="button button-outline" onClick={onClose}>
        Đóng chi tiết
      </button>
      <DataState {...state} />
      <DataState error={error} />
      {!manager && !state.loading && !state.data?.length && (
        <button
          className="button button-primary"
          disabled={busy || event.status !== 'active'}
          onClick={() => action(() => api.post(`/events/${event.id}/register`))}
        >
          Đăng ký tham gia
        </button>
      )}
      {manager && (
        <form
          className="modal-form"
          onSubmit={(e) => {
            e.preventDefault()
            const form = e.currentTarget
            const userId = new FormData(form).get('user_id')
            action(async () => {
              await api.post(`/events/${event.id}/participants`, {
                user_id: userId,
              })
              form.reset()
            })
          }}
        >
          <label>
            Mã tài khoản người tham gia
            <input
              name="user_id"
              required
              pattern="[0-9a-fA-F-]{36}"
              disabled={busy || event.status !== 'active'}
            />
          </label>
          <button
            className="button button-primary"
            disabled={busy || event.status !== 'active'}
          >
            Thêm người tham gia
          </button>
        </form>
      )}
      {manager && (
        <label className="csv-import">
          Nhập danh sách CSV{' '}
          <input
            type="file"
            accept=".csv"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files[0]
              if (!file) return
              const form = new FormData()
              form.append('file', file)
              action(() =>
                api.post(`/events/${event.id}/participants/import`, form, {
                  headers: { 'Content-Type': undefined },
                }),
              )
              e.target.value = ''
            }}
          />
        </label>
      )}
      {state.data?.map((person) => (
        <div className="participant-row" key={person.id}>
          <span>
            <b>{person.full_name}</b>
            <small className="hash-text">
              {person.wallet_address || 'Chưa liên kết ví'}
            </small>
          </span>
          {manager ? (
            <select
              aria-label={`Điểm danh ${person.full_name}`}
              disabled={busy}
              value={person.status}
              onChange={(e) =>
                action(() =>
                  api.patch(`/events/${event.id}/participants/${person.id}`, {
                    status: e.target.value,
                  }),
                )
              }
            >
              {['registered', 'confirmed', 'attended', 'absent'].map((s) => (
                <option value={s} key={s}>
                  {statusText(s)}
                </option>
              ))}
            </select>
          ) : (
            <Badge status={person.status} />
          )}
        </div>
      ))}
      {manager && (
        <Link
          to={`/certificates?event=${event.id}`}
          className="button button-primary"
        >
          Cấp chứng nhận
        </Link>
      )}
    </section>
  )
}

export default function EventsPage() {
  const user = useAuthStore((state) => state.user)
  const location = useLocation()
  const manager = ['admin', 'organizer'].includes(user.role)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [form, setForm] = useState(
    location.pathname.endsWith('/new') ? {} : null,
  )
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')
  const state = useApiData(async () => {
    const [events, managed, organizations] = await Promise.all([
      allPages('/events'),
      manager ? allPages('/events', { managed_only: true }) : [],
      manager ? allPages('/organizations', { managed_only: true }) : [],
    ])
    return {
      events,
      managed: new Set(managed.map((e) => e.id)),
      organizations,
    }
  }, [user.id, manager])
  async function createOrganization(e) {
    e.preventDefault()
    setError('')
    try {
      await api.post(
        '/organizations',
        Object.fromEntries(new FormData(e.currentTarget)),
      )
      await state.reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }
  const filtered =
    state.data?.events.filter(
      (e) =>
        e.name.toLowerCase().includes(query.toLowerCase()) &&
        (!status || e.status === status),
    ) || []
  return (
    <>
      <Heading
        title="Quản lý sự kiện"
        description="Sự kiện, đăng ký và điểm danh từ hệ thống."
        actions={
          manager && (
            <button
              className="button button-primary"
              onClick={() => setForm({})}
            >
              Tạo sự kiện
            </button>
          )
        }
      />
      <DataState {...state} />
      <DataState error={error} />
      {manager && (
        <OrganizationBranding
          organizations={state.data?.organizations}
          onChanged={state.reload}
        />
      )}
      {manager && state.data && !state.data.organizations.length && (
        <section className="panel data-panel">
          <h2>Tạo tổ chức</h2>
          <form className="modal-form" onSubmit={createOrganization}>
            <label>
              Tên tổ chức
              <input required name="name" minLength={2} />
            </label>
            <label>
              Slug
              <input
                required
                name="slug"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                minLength={2}
              />
            </label>
            <button className="button button-primary">Tạo tổ chức</button>
          </form>
        </section>
      )}
      {form && state.data && (
        <EventForm
          key={form.id || 'new'}
          event={form.id ? form : null}
          organizations={state.data.organizations}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            state.reload()
          }}
        />
      )}
      <div className="filter-bar">
        <div className="search-box">
          <input
            aria-label="Tìm kiếm sự kiện"
            placeholder="Tìm kiếm sự kiện…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="filter-select"
          aria-label="Trạng thái sự kiện"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tất cả trạng thái</option>
          {['active', 'draft', 'closed', 'completed', 'cancelled'].map((s) => (
            <option key={s} value={s}>
              {statusText(s)}
            </option>
          ))}
        </select>
      </div>
      <div className="event-list">
        {filtered.map((event) => (
          <article className="event-row" key={event.id}>
            <div className="event-details">
              <Badge status={event.status} />
              <h2>{event.name}</h2>
              <p>{event.description}</p>
              <p>
                {dateText(event.start_date)} – {dateText(event.end_date)} ·{' '}
                {event.location}
              </p>
              <div className="heading-actions">
                <button
                  className="button button-outline"
                  onClick={() => setSelected(event)}
                >
                  Chi tiết & người tham gia
                </button>
                {state.data.managed.has(event.id) &&
                  !['completed', 'cancelled'].includes(event.status) && (
                    <button
                      className="button button-outline"
                      onClick={() => setForm(event)}
                    >
                      Chỉnh sửa
                    </button>
                  )}
                {state.data.managed.has(event.id) &&
                  ['active', 'draft'].includes(event.status) && (
                    <button
                      className="button button-outline"
                      onClick={async () => {
                        try {
                          await api.patch(`/events/${event.id}`, {
                            status:
                              event.status === 'draft' ? 'active' : 'closed',
                          })
                          await state.reload()
                        } catch (err) {
                          setError(errorMessage(err))
                        }
                      }}
                    >
                      {event.status === 'draft' ? 'Mở sự kiện' : 'Đóng sự kiện'}
                    </button>
                  )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {!state.loading && !filtered.length && (
        <p className="empty-state">Chưa có sự kiện phù hợp.</p>
      )}
      {selected && (
        <EventParticipants
          key={selected.id}
          event={
            state.data?.events.find((e) => e.id === selected.id) || selected
          }
          manager={state.data?.managed.has(selected.id)}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
