export function ConceptList({ names, className = '' }: { names: string[]; className?: string }) {
  if (names.length === 0) return null
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {names.map((name) => (
        <li key={name} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-medium text-accent">
          {name}
        </li>
      ))}
    </ul>
  )
}
