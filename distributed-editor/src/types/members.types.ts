import type { Role } from "./auth.types"

export interface ProjectMember {
  id: string
  name: string
  role: Role
  online: boolean
}