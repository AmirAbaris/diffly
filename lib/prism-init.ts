import { Prism } from "prism-react-renderer"

;(globalThis as typeof globalThis & { Prism?: typeof Prism }).Prism = Prism

export { Prism }
