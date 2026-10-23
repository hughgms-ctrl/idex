import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { churchSchema, type ChurchInput } from '@/lib/schemas'

export function ChurchForm({
  defaultValues,
  onSubmit,
  submitLabel = 'Cadastrar igreja',
}: {
  defaultValues?: ChurchInput | null
  onSubmit: (values: ChurchInput) => Promise<void>
  submitLabel?: string
}) {
  const form = useForm<ChurchInput>({
    resolver: zodResolver(churchSchema),
    defaultValues: defaultValues ?? { churchName: '', ministryName: 'Louvor' },
  })
  const { errors, isSubmitting } = form.formState

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <FormField id="churchName" label="Nome da igreja" error={errors.churchName?.message}>
        <Input
          id="churchName"
          autoComplete="organization"
          placeholder="Ex.: Igreja Esperança"
          aria-invalid={Boolean(errors.churchName)}
          {...form.register('churchName')}
        />
      </FormField>
      <FormField id="ministryName" label="Primeiro ministério" error={errors.ministryName?.message}>
        <Input
          id="ministryName"
          aria-invalid={Boolean(errors.ministryName)}
          {...form.register('ministryName')}
        />
      </FormField>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? 'Cadastrando…' : submitLabel}
      </Button>
    </form>
  )
}
