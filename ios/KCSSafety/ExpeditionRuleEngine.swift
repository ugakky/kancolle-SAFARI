import Foundation

struct ExpeditionCheckResult: Hashable {
    let supported: Bool
    let canDispatch: Bool?
    let failures: [String]
    let warnings: [String]
}

enum ExpeditionRuleEngine {
    // 艦種IDは kcsapi api_stype に合わせる。
    private enum ShipType {
        static let escort = 1
        static let destroyer = 2
        static let lightCruiser = 3
        static let heavyCruiser = 5
        static let lightAircraftCarrier = 7
        static let aviationBattleship = 10
        static let standardAircraftCarrier = 11
        static let submarine = 13
        static let submarineCarrier = 14
        static let seaplaneTender = 16
        static let armoredCarrier = 18
        static let trainingCruiser = 21
    }

    static func check(missionId: Int, fleet: KCSExpeditionFleet) -> ExpeditionCheckResult {
        var failures: [String] = []
        var warnings: [String] = []
        let ships = fleet.ships

        if fleet.isRunning {
            failures.append("この艦隊は現在遠征中")
        }

        if ships.contains(where: { !$0.isFullySupplied }) {
            warnings.append("未補給艦あり")
        }
        if ships.contains(where: \.isHeavyDamage) {
            warnings.append("大破艦あり")
        }
        let kira = ships.filter { ($0.cond ?? 0) >= 50 }.count
        if !ships.isEmpty && kira < ships.count {
            warnings.append("キラ \(kira)/\(ships.count)")
        }

        func flagship(_ level: Int) {
            let actual = ships.first?.lv ?? 0
            if actual < level { failures.append("旗艦Lv \(actual)/\(level)") }
        }
        func totalLevel(_ level: Int) {
            let actual = ships.reduce(0) { $0 + $1.lv }
            if actual < level { failures.append("合計Lv \(actual)/\(level)") }
        }
        func shipCount(_ count: Int) {
            if ships.count < count { failures.append("艦数 \(ships.count)/\(count)") }
        }
        func typeCount(_ type: Int, _ count: Int, _ label: String) {
            let actual = ships.filter { $0.shipType == type }.count
            if actual < count { failures.append("\(label) \(actual)/\(count)") }
        }
        func smallShipCount(_ count: Int) {
            let actual = ships.filter { $0.shipType == ShipType.destroyer || $0.shipType == ShipType.escort }.count
            if actual < count { failures.append("駆逐+海防 \(actual)/\(count)") }
        }
        func carrierCount(_ count: Int) {
            let carrierTypes = [ShipType.lightAircraftCarrier, ShipType.standardAircraftCarrier, ShipType.armoredCarrier, ShipType.seaplaneTender]
            let actual = ships.filter { carrierTypes.contains($0.shipType) }.count
            if actual < count { failures.append("空母系 \(actual)/\(count)") }
        }
        func submarineCount(_ count: Int) {
            let actual = ships.filter { $0.shipType == ShipType.submarine || $0.shipType == ShipType.submarineCarrier }.count
            if actual < count { failures.append("潜水艦系 \(actual)/\(count)") }
        }
        func escortFleet() {
            let leaders = ships.filter {
                $0.shipType == ShipType.lightCruiser || $0.shipType == ShipType.trainingCruiser
            }.count
            let dd = ships.filter { $0.shipType == ShipType.destroyer }.count
            let de = ships.filter { $0.shipType == ShipType.escort }.count
            if !(leaders >= 1 && (dd + de) >= 2) {
                failures.append("護衛隊(軽巡/練巡1 + 駆逐/海防2以上)")
            }
        }
        func drumEquippedShips(_ count: Int) {
            let actual = ships.filter { ship in
                ship.slotItemNames.contains { $0.contains("ドラム缶") }
            }.count
            if actual < count { failures.append("ドラム缶装備艦 \(actual)/\(count)") }
        }

        let supported: Bool
        switch missionId {
        case 1: // 練習航海
            supported = true; flagship(1); shipCount(2)
        case 2: // 長距離練習航海
            supported = true; flagship(2); shipCount(4)
        case 3: // 警備任務
            supported = true; flagship(3); shipCount(3)
        case 4: // 対潜警戒任務
            supported = true; flagship(3); escortFleet()
        case 5: // 海上護衛任務
            supported = true; flagship(3); shipCount(4); escortFleet()
        case 6: // 防空射撃演習
            supported = true; flagship(4); shipCount(4)
        case 7: // 観艦式予行
            supported = true; flagship(5); shipCount(6)
        case 8: // 観艦式
            supported = true; flagship(6); shipCount(6)
        case 9: // タンカー護衛任務
            supported = true; flagship(3); shipCount(4); escortFleet()
        case 10: // 強行偵察任務
            supported = true; flagship(3); shipCount(3); typeCount(ShipType.lightCruiser, 2, "軽巡")
        case 11: // ボーキサイト輸送任務
            supported = true; flagship(6); shipCount(4); smallShipCount(2)
        case 12: // 資源輸送任務
            supported = true; flagship(4); shipCount(4); smallShipCount(2)
        case 13: // 鼠輸送作戦
            supported = true; flagship(5); shipCount(6); typeCount(ShipType.lightCruiser, 1, "軽巡"); typeCount(ShipType.destroyer, 4, "駆逐")
        case 14: // 包囲陸戦隊撤収作戦
            supported = true; flagship(6); shipCount(6); typeCount(ShipType.lightCruiser, 1, "軽巡"); typeCount(ShipType.destroyer, 3, "駆逐")
        case 15: // 囮機動部隊支援作戦
            supported = true; flagship(8); shipCount(6); carrierCount(2); typeCount(ShipType.destroyer, 2, "駆逐")
        case 16: // 艦隊決戦援護作戦
            supported = true; flagship(10); shipCount(6); typeCount(ShipType.lightCruiser, 1, "軽巡"); typeCount(ShipType.destroyer, 2, "駆逐")
        case 17: // 敵地偵察作戦
            supported = true; flagship(20); shipCount(6); typeCount(ShipType.lightCruiser, 1, "軽巡"); typeCount(ShipType.destroyer, 3, "駆逐")
        case 18: // 航空機輸送作戦
            supported = true; flagship(15); shipCount(6); carrierCount(3); typeCount(ShipType.destroyer, 2, "駆逐")
        case 19: // 北号作戦
            supported = true; flagship(20); shipCount(6); typeCount(ShipType.aviationBattleship, 2, "航戦"); typeCount(ShipType.destroyer, 2, "駆逐")
        case 20: // 潜水艦哨戒任務
            supported = true; flagship(1); submarineCount(1); typeCount(ShipType.lightCruiser, 1, "軽巡")
        case 21: // 北方鼠輸送作戦
            supported = true; flagship(15); totalLevel(30); typeCount(ShipType.lightCruiser, 1, "軽巡"); typeCount(ShipType.destroyer, 4, "駆逐"); drumEquippedShips(3)
        default:
            supported = false
        }

        if !supported {
            return ExpeditionCheckResult(
                supported: false,
                canDispatch: nil,
                failures: ["この遠征は条件DB未登録"],
                warnings: warnings
            )
        }

        return ExpeditionCheckResult(
            supported: true,
            canDispatch: failures.isEmpty,
            failures: failures,
            warnings: warnings
        )
    }
}
