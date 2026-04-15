'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function ProfilePage() {
  const [nickname, setNickname] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        setNickname(data.nickname ?? '')
        setAvatarUrl(data.avatar_url ?? null)
      }
    })
  }, [])

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const ext = file.name.split('.').pop()
    const path = `${user.id}/avatar.${ext}`

    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) {
      setMessage('アップロードに失敗しました')
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    setAvatarUrl(publicUrl + '?t=' + Date.now())
    setUploading(false)
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      nickname: nickname.trim() || null,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })

    setSaving(false)
    setMessage(error ? '保存に失敗しました' : '保存しました！')
  }

  return (
    <div className="min-h-screen bg-amber-50 flex flex-col">
      <div className="bg-amber-500 text-white px-6 py-4 flex items-center gap-3 shadow">
        <button onClick={() => router.push('/')} className="text-white text-xl">←</button>
        <h1 className="text-xl font-bold">プロフィール</h1>
      </div>

      <div className="flex flex-col items-center px-6 py-8 gap-6">
        {/* アバター */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-28 h-28 rounded-full border-4 border-amber-400 overflow-hidden bg-amber-100 flex items-center justify-center cursor-pointer shadow-lg"
            onClick={() => fileInputRef.current?.click()}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl">👤</span>
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-sm text-amber-600 font-medium hover:underline disabled:opacity-40"
          >
            {uploading ? 'アップロード中...' : '画像を変更する'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>

        {/* ニックネーム */}
        <div className="w-full max-w-sm">
          <label className="text-sm font-bold text-gray-600 mb-2 block">ニックネーム</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="名前を入力してね"
            maxLength={20}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 text-[#333]"
          />
        </div>

        {/* 保存ボタン */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full max-w-sm bg-amber-500 text-white font-bold py-3 rounded-xl hover:bg-amber-600 disabled:opacity-40 transition-all"
        >
          {saving ? '保存中...' : '保存する'}
        </button>

        {message && (
          <p className={`text-sm font-medium ${message.includes('失敗') ? 'text-red-500' : 'text-green-600'}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
