import { useState } from 'react'
import api from '@/utils/api'
import { errorMessage } from '@/utils/errors'
import { DataState } from './DataUI'

export default function OrganizationBranding({ organizations, onChanged }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function upload(event, organization) {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 1024 * 1024) {
      setError('Logo phải nhỏ hơn 1 MB.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      await api.put(`/organizations/${organization.id}/logo`, form, {
        headers: { 'Content-Type': undefined },
      })
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  if (!organizations?.length) return null
  return (
    <details className="panel data-panel organization-branding">
      <summary>Logo tổ chức trên chứng nhận PDF</summary>
      <DataState error={error} />
      {organizations.map((org) => (
        <div className="organization-logo-row" key={org.id}>
          {org.logo_data_url && (
            <img src={org.logo_data_url} alt={`Logo ${org.name}`} />
          )}
          <b>{org.name}</b>
          <label className="button button-outline">
            Tải logo PNG/JPEG
            <input
              aria-label={`Logo ${org.name}`}
              type="file"
              accept="image/png,image/jpeg"
              disabled={busy}
              onChange={(e) => upload(e, org)}
            />
          </label>
        </div>
      ))}
    </details>
  )
}
