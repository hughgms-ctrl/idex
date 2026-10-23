import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Section'
import { ChurchForm } from '@/features/church/ChurchForm'
import { useChurch } from '@/features/church/church-context'
import { useCreateChurch } from '@/features/church/useCreateChurch'
import { errorMessage } from '@/lib/errors'

// Para quem já usa o app e quer cadastrar mais uma igreja.
export function CreateChurchPage() {
  const navigate = useNavigate()
  const createChurch = useCreateChurch()
  const { selectChurch } = useChurch()

  return (
    <>
      <PageHeader
        title="Cadastrar igreja"
        description="Você será o responsável pela nova igreja e líder do primeiro ministério."
      />
      <Panel>
        <ChurchForm
          onSubmit={async (values) => {
            try {
              const churchId = await createChurch.mutateAsync(values)
              selectChurch(churchId)
              toast.success('Igreja cadastrada!')
              navigate('/membros')
            } catch (err) {
              toast.error(errorMessage(err))
            }
          }}
        />
      </Panel>
    </>
  )
}
