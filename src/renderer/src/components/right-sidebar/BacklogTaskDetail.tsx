import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import type { BacklogTask } from '../../../../shared/backlog-types'

const markdownClassName =
  '[&_.comment-md-p]:block [&_.comment-md-p+.comment-md-p]:mt-2 [&_.comment-md-h]:block [&_.comment-md-h]:mt-2 [&_.comment-md-h:first-child]:mt-0'

export default function BacklogTaskDetail({ task }: { task: BacklogTask }): React.JSX.Element {
  return (
    <div className="min-w-0 space-y-4 text-xs">
      <div className="min-w-0">
        <p className="font-mono text-[11px] text-muted-foreground">{task.id}</p>
        <h2 className="mt-1 break-words text-sm font-semibold">{task.title}</h2>
        <p className="mt-1 text-muted-foreground">
          {task.status}
          {task.priority ? ` · ${task.priority}` : ''}
        </p>
      </div>
      {task.description ? (
        <div className="min-w-0">
          <h3 className="mb-1 font-semibold">
            {translate('components.backlog.description', 'Description')}
          </h3>
          <CommentMarkdown content={task.description} className={markdownClassName} />
        </div>
      ) : null}
      {task.acceptanceCriteria?.length ? (
        <div className="min-w-0">
          <h3 className="mb-2 font-semibold">
            {translate('components.backlog.acceptanceCriteria', 'Acceptance criteria')}
          </h3>
          <ul className="space-y-2">
            {task.acceptanceCriteria.map((criterion) => (
              <li key={criterion.index} className="flex min-w-0 gap-2">
                <span aria-hidden="true" className="shrink-0">
                  {criterion.checked ? '☑' : '☐'}
                </span>
                <CommentMarkdown
                  content={criterion.text}
                  className={`min-w-0 flex-1 ${markdownClassName}`}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
