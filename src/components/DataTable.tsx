import type { ReactNode } from 'react'
import { Empty, Loading } from './Ui'

type Column<T> = {
  key: string
  title: string
  render: (item: T) => ReactNode
  className?: string
  mobileWide?: boolean
}

const isActionColumn = (key: string) => /^(action|actions|operation|operations)$/i.test(key)

export function DataTable<T>({ rows, columns, loading, emptyTitle }: { rows: T[]; columns: Column<T>[]; loading?: boolean; emptyTitle?: string }) {
  if (loading) return <Loading />
  if (!rows.length) return <Empty title={emptyTitle} />

  return <>
    <div className="table-wrap table-wrap--desktop">
      <table className="data-table">
        <thead><tr>{columns.map(column => <th key={column.key} className={column.className}>{column.title}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={(row as { id?: string | number }).id ?? index}>{columns.map(column => <td key={column.key} className={column.className}>{column.render(row)}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="mobile-data-list" role="list">
      {rows.map((row, rowIndex) => <article className="mobile-data-card" role="listitem" key={(row as { id?: string | number }).id ?? rowIndex}>
        {columns.map((column, columnIndex) => {
          const action = isActionColumn(column.key)
          const wide = column.mobileWide || columnIndex === 0 || action
          return <div key={column.key} className={`mobile-data-field${wide ? ' is-wide' : ''}${columnIndex === 0 ? ' is-primary' : ''}${action ? ' is-actions' : ''}`}>
            <span className="mobile-data-label">{column.title}</span>
            <div className="mobile-data-value">{column.render(row)}</div>
          </div>
        })}
      </article>)}
    </div>
  </>
}
