import 'i18next'
import type { resources } from './resources'

// Translation keys are type-checked against the English files.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: (typeof resources)['en']
  }
}
