import * as React from 'react'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { Select as SelectPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

// Lista de escolha com o visual do app (painel escuro, opções grandes). Aceita
// os mesmos filhos e props de um <select> (<option>, <optgroup>, value,
// onChange, register do react-hook-form): um <select> escondido guarda o valor
// e recebe o evento de mudança, então quem usa não precisa mudar nada.

type Opt = { value: string; label: React.ReactNode; disabled?: boolean }
type Group = { label?: string; options: Opt[] }

// Radix não aceita "" como valor de item
const EMPTY = '__vazio__'
const toItem = (v: string) => (v === '' ? EMPTY : v)
const fromItem = (v: string) => (v === EMPTY ? '' : v)

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

function parse(children: React.ReactNode): Group[] {
  const groups: Group[] = []
  let loose: Opt[] = []
  const flush = () => {
    if (loose.length) groups.push({ options: loose })
    loose = []
  }
  const walk = (nodes: React.ReactNode) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return
      const props = child.props as {
        value?: string | number
        children?: React.ReactNode
        disabled?: boolean
        label?: string
      }
      if (child.type === React.Fragment) walk(props.children)
      else if (child.type === 'option')
        loose.push({
          value: String(props.value ?? textOf(props.children)),
          label: props.children,
          disabled: props.disabled,
        })
      else if (child.type === 'optgroup') {
        flush()
        const inner: Opt[] = []
        React.Children.forEach(props.children, (o) => {
          if (!React.isValidElement(o)) return
          const p = o.props as {
            value?: string | number
            children?: React.ReactNode
            disabled?: boolean
          }
          inner.push({
            value: String(p.value ?? textOf(p.children)),
            label: p.children,
            disabled: p.disabled,
          })
        })
        groups.push({ label: props.label, options: inner })
      }
    })
  }
  walk(children)
  flush()
  return groups
}

const nativeValueSetter = () =>
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set

function NativeSelect({
  className,
  wrapperClassName,
  children,
  id,
  value,
  defaultValue,
  disabled,
  ref,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ...props
}: React.ComponentProps<'select'> & { wrapperClassName?: string }) {
  const selectRef = React.useRef<HTMLSelectElement | null>(null)
  const groups = React.useMemo(() => parse(children), [children])
  const first = groups[0]?.options[0]?.value ?? ''
  const controlled = value !== undefined
  const [internal, setInternal] = React.useState(
    defaultValue !== undefined ? String(defaultValue) : first,
  )
  const current = controlled ? String(value) : internal

  // react-hook-form (reset/setValue) muda o <select> escondido sem evento:
  // confere a cada render (só atualiza se mudou)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useLayoutEffect(() => {
    if (controlled) return
    const v = selectRef.current?.value
    if (v !== undefined && v !== internal) setInternal(v)
  })

  const setRefs = (el: HTMLSelectElement | null) => {
    selectRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  const pick = (itemValue: string) => {
    const v = fromItem(itemValue)
    if (!controlled) setInternal(v)
    const el = selectRef.current
    if (!el) return
    nativeValueSetter()?.call(el, v)
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const selected = groups.flatMap((g) => g.options).find((o) => o.value === current)

  return (
    <div className={cn('relative w-full', wrapperClassName)}>
      <select
        {...props}
        ref={setRefs}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        className="hidden"
      >
        {children}
      </select>
      <SelectPrimitive.Root value={toItem(current)} onValueChange={pick} disabled={disabled}>
        <SelectPrimitive.Trigger
          id={id}
          data-slot="native-select"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          className={cn(
            'border-input dark:bg-input/30 flex h-11 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 text-left text-base shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'data-[state=open]:border-ring aria-invalid:border-destructive',
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {selected ? selected.label : <span className="text-muted-foreground">Escolha</span>}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" aria-hidden="true" />
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={6}
            collisionPadding={12}
            className={cn(
              'bg-popover text-popover-foreground z-50 overflow-hidden rounded-xl border shadow-xl',
              'max-h-[min(var(--radix-select-content-available-height),22rem)] min-w-[var(--radix-select-trigger-width)]',
              'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            )}
          >
            <SelectPrimitive.Viewport className="p-1.5">
              {groups.map((g, i) => (
                <SelectPrimitive.Group key={g.label ?? `g${i}`}>
                  {i > 0 && <SelectPrimitive.Separator className="bg-border mx-2 my-1.5 h-px" />}
                  {g.label && (
                    <SelectPrimitive.Label className="text-muted-foreground px-3 pt-1.5 pb-1 text-xs font-semibold tracking-wider uppercase">
                      {g.label}
                    </SelectPrimitive.Label>
                  )}
                  {g.options.map((o) => (
                    <SelectPrimitive.Item
                      key={o.value}
                      value={toItem(o.value)}
                      disabled={o.disabled}
                      className={cn(
                        'relative flex min-h-11 cursor-pointer items-center gap-2 rounded-lg py-2 pr-9 pl-3 text-[15px] outline-none select-none md:text-sm',
                        'data-[highlighted]:bg-secondary data-[state=checked]:text-primary data-[state=checked]:font-semibold',
                        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
                      )}
                    >
                      <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                      <SelectPrimitive.ItemIndicator className="absolute right-3 flex items-center">
                        <CheckIcon className="size-4" aria-hidden="true" />
                      </SelectPrimitive.ItemIndicator>
                    </SelectPrimitive.Item>
                  ))}
                </SelectPrimitive.Group>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  )
}

export { NativeSelect }
