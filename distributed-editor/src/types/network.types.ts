export type PeerStatus = "connected" | "discovered" | "offline"

export interface PeerIdentity {
  peerId: string
  name: string
  ip: string
  email: string
}

export interface NetworkPeer extends PeerIdentity {
  status: PeerStatus
  lastSeen: number
}