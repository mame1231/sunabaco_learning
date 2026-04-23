import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  // リクエストしたユーザーが管理者か確認
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabaseAuth.auth.getUser()

  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // サービスロールキーで全会話を取得（RLSをバイパス）
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id, user_id, grade, subject, messages, created_at, updated_at')
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ユーザーのメールアドレスを取得
  const userIds = [...new Set(data.map((c) => c.user_id))]
  const { data: users } = await supabaseAdmin.auth.admin.listUsers()
  const userMap = Object.fromEntries(
    (users?.users ?? []).filter((u) => userIds.includes(u.id)).map((u) => [u.id, u.email])
  )

  const enriched = data.map((c) => ({
    ...c,
    user_email: userMap[c.user_id] ?? '不明',
  }))

  return NextResponse.json(enriched)
}
