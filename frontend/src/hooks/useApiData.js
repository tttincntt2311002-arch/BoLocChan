import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '@/utils/errors'

export default function useApiData(loader, dependencies = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const reload = useCallback(async () => {
    const current = ++generation.current
    setLoading(true)
    setError('')
    try {
      const result = await loader()
      if (generation.current === current) setData(result)
    } catch (err) {
      if (generation.current === current) setError(errorMessage(err))
    } finally {
      if (generation.current === current) setLoading(false)
    }
    // Callers declare the values that change their query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)
  useEffect(() => {
    setData(null)
    reload()
    const counter = generation
    return () => {
      counter.current++
    }
  }, [reload])
  return { data, loading, error, reload }
}
