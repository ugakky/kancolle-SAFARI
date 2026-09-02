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

struct KCSExpeditionShip: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let lv: Int
    let shipType: Int
    let hpNow: Int?
    let hpMax: Int?
    let cond: Int?
    let fuel: Int?
    let fuelMax: Int?
    let ammo: Int?
    let ammoMax: Int?
    let slotItemNames: [String]

    var isHeavyDamage: Bool {
        guard let hpNow, let hpMax, hpMax > 0 else { return false }
        return hpNow <= 0 || hpNow * 4 <= hpMax
    }

    var isFullySupplied: Bool {
        guard let fuel, let fuelMax, let ammo, let ammoMax else { return true }
        return fuel >= fuelMax && ammo >= ammoMax
    }
}

struct KCSExpeditionFleet: Codable, Identifiable, Hashable {
    let id: Int
    let ships: [KCSExpeditionShip]
    let missionId: Int?
    let missionName: String?
    let completionTimeMillis: Double?

    var isRunning: Bool {
        guard let missionId else { return false }
        return missionId > 0
    }
}

struct KCSExpeditionMission: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let durationMinutes: Int?
    let requiredShips: Int?
}

struct KCSExpeditionSnapshot: Codable, Hashable {
    let fleets: [KCSExpeditionFleet]
    let missions: [KCSExpeditionMission]
    let updatedAtMillis: Double
}

struct KCSBridgeEnvelope: Codable {
    let type: String
    let snapshot: KCSSnapshot?
    let rect: KCSGameRect?
    let expedition: KCSExpeditionSnapshot?
}
