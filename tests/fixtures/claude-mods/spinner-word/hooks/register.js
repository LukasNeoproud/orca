export function register(on) {
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    return next({ ...e, props: { ...e.props, word: 'Modding', suffix: ' · mod…' } })
  })
}
