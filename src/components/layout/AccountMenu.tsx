import { useState } from 'react'
import { Link } from 'react-router'
import { Church, Layers, LogOut, Settings2, UserRound } from 'lucide-react'

import { useUser } from '@/auth/auth-context'
import { ProfileDialog } from '@/components/layout/ProfileDialog'
import { useMyProfile } from '@/features/profile/queries'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useChurch } from '@/features/church/church-context'
import { initials } from '@/lib/format'
import { supabase } from '@/lib/supabase'

export function AccountMenu({ variant }: { variant: 'header' | 'sidebar' }) {
  const user = useUser()
  const profile = useMyProfile()
  const { churches, church, ministries, ministry, selectChurch, selectMinistry } = useChurch()
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const name = profile.data?.full_name || user.email || ''

  const trigger =
    variant === 'header' ? (
      <button
        type="button"
        aria-label="Abrir menu da conta"
        className="bg-secondary flex size-11 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold"
      >
        {initials(name)}
      </button>
    ) : (
      <button
        type="button"
        className="hover:bg-secondary/60 flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left"
      >
        <span className="bg-secondary flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
          {initials(name)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      </button>
    )

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="right" className="gap-0">
          <SheetHeader>
            <SheetTitle>{name}</SheetTitle>
            <SheetDescription>{user.email}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-6">
            {churches.length > 1 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="church-select">Igreja</Label>
                <NativeSelect
                  id="church-select"
                  value={church.id}
                  onChange={(e) => selectChurch(e.target.value)}
                >
                  {churches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            {ministries.length > 1 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="ministry-select">Ministério</Label>
                <NativeSelect
                  id="ministry-select"
                  value={ministry?.id}
                  onChange={(e) => selectMinistry(e.target.value)}
                >
                  {ministries.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            <Separator />
            <nav className="flex flex-col gap-1">
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  setOpen(false)
                  setProfileOpen(true)
                }}
              >
                <UserRound aria-hidden="true" /> Meu perfil
              </Button>
              <Button
                asChild
                variant="ghost"
                className="justify-start"
                onClick={() => setOpen(false)}
              >
                <Link to="/ministerios">
                  <Layers aria-hidden="true" /> Ministérios e funções
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="justify-start"
                onClick={() => setOpen(false)}
              >
                <Link to="/configuracoes">
                  <Settings2 aria-hidden="true" /> Configurações
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="justify-start"
                onClick={() => setOpen(false)}
              >
                <Link to="/cadastro-igreja">
                  <Church aria-hidden="true" /> Cadastrar outra igreja
                </Link>
              </Button>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive justify-start"
                onClick={() => void supabase.auth.signOut()}
              >
                <LogOut aria-hidden="true" /> Sair
              </Button>
            </nav>
          </div>
        </SheetContent>
      </Sheet>
      {profile.data && (
        <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} profile={profile.data} />
      )}
    </>
  )
}
