import { useEffect, useState } from 'react'
import { getLocal, getSettings, type LocalKey, type LocalSchema, onLocalChange, type Settings } from '../lib/storage'

/** A chrome.storage.local value kept current; `loaded` turns true after the first read. */
export function useLocal<K extends LocalKey>(key: K): { value: LocalSchema[K] | undefined; loaded: boolean } {
  const [state, setState] = useState<{ value: LocalSchema[K] | undefined; loaded: boolean }>({ value: undefined, loaded: false })
  useEffect(() => {
    let live = true
    let changed = false
    const off = onLocalChange(key, (value) => {
      changed = true
      if (live) setState({ value, loaded: true })
    })
    void getLocal(key).then((value) => {
      // a change that landed first is newer than this read
      if (live && !changed) setState({ value, loaded: true })
    })
    return () => {
      live = false
      off()
    }
  }, [key])
  return state
}

/** The signed-in settings, null when signed out, undefined until read. */
export function useSettings(): Settings | null | undefined {
  const [settings, setSettings] = useState<Settings | null>()
  useEffect(() => {
    let live = true
    let seq = 0
    const load = () => {
      const current = ++seq
      void getSettings().then((value) => {
        if (live && current === seq) setSettings(value)
      })
    }
    const off = onLocalChange('settings', load)
    load()
    return () => {
      live = false
      off()
    }
  }, [])
  return settings
}
