export type Role = "owner" | "admin" | "member" | "viewer"

export interface User {
  id: string
  name: string
  role: Role

  // ✅ add these so we don't use "any"
  ip: string
  email: string
}

export interface Permissions {
  canAddMember: boolean
  canRemoveMember: boolean
  canChangeRole: boolean
}