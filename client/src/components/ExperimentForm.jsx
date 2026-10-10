// Change-log entry form, used for both adding and editing an entry.
// `values` is { name, start_date, end_date, notes }; `setValues` is its state setter.
export default function ExperimentForm({ values, setValues, onSubmit, onCancel, error, submitLabel }) {
  const set = field => e => setValues(p => ({ ...p, [field]: e.target.value }))

  return (
    <form className="add-exp-form" onSubmit={onSubmit}>
      <div className="add-exp-fields">
        <div className="form-group">
          <label>Name *</label>
          <input
            value={values.name}
            onChange={set('name')}
            placeholder="e.g. Switched to CV v2"
          />
        </div>
        <div className="form-group">
          <label>From</label>
          <input type="date" value={values.start_date} onChange={set('start_date')} />
        </div>
        <div className="form-group">
          <label>To</label>
          <input type="date" value={values.end_date} onChange={set('end_date')} />
        </div>
      </div>
      <div className="form-group">
        <label>Notes</label>
        <textarea
          rows={2}
          value={values.notes}
          onChange={set('notes')}
          placeholder="What changed?"
        />
      </div>
      {error && <p className="error-msg">{error}</p>}
      <div className="add-exp-btns">
        <button type="submit" className="btn-primary" style={{ width: 'auto' }}>{submitLabel}</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
