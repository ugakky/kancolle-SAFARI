import Foundation

struct KCSShipRow: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let lv: Int?
    let hpNow: Int?
    let hpMax: Int?
    let hpSource: String?
    let cond: Int?
    let fuel: Int?
    let ammo: Int?
    let onslot: [Int]
    let damage: String
}

struct KCSFleetSnapshot: Codable, Identifiable, Hashable {
    let id: Int
    let isSortie: Bool
    let ships: [KCSShipRow]
}

struct KCSPlaneLoss: Codable, Hashable {
    let before: Int
    let lost: Int
}

struct KCSSnapshot: Codable, Hashable {
    let apiCount: Int
    let lastApi: String
    let sortieDeck: Int
    let combined: Int
    let choice: Bool
    let uncertain: Bool
    let uncertainReason: String
    let heavyCount: Int
    let fleets: [KCSFleetSnapshot]
    let planeLoss: KCSPlaneLoss?
}

struct KCSGameRect: Codable, Hashable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct KCSBridgeEnvelope: Codable {
    let type: String
    let snapshot: KCSSnapshot?
    let rect: KCSGameRect?
}
