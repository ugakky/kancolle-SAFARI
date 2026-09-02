import SwiftUI

struct SupportPanelView: View {
    @EnvironmentObject private var browser: BrowserModel
    @Environment(\.dismiss) private var dismiss

    @State private var selectedFleet = 1

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    diagnostics
                    fleetTabs
                    fleetCard
                    guardSettings
                }
                .padding(14)
            }
            .navigationTitle("KCS Safety")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("閉じる") { dismiss() }
                }
            }
        }
    }

    private var diagnostics: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text("状態")
                    .font(.headline)
                Spacer()
                Text(browser.statusText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let snapshot = browser.snapshot {
                Text("API \(snapshot.apiCount) / 最終: \(snapshot.lastApi.isEmpty ? "-" : snapshot.lastApi)")
                    .font(.caption.monospaced())
                if snapshot.uncertain {
                    Label(snapshot.uncertainReason.isEmpty ? "HP判定不明" : snapshot.uncertainReason,
                          systemImage: "exclamationmark.triangle.fill")
                    .font(.caption.bold())
                    .foregroundStyle(.orange)
                }
                if snapshot.heavyCount > 0 {
                    Label("出撃艦隊に大破 \(snapshot.heavyCount)隻", systemImage: "exclamationmark.octagon.fill")
                        .font(.caption.bold())
                        .foregroundStyle(.red)
                }
            } else {
                Text("艦これAPI待ち。母港まで読み込むと艦隊情報が表示されます。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private var fleetTabs: some View {
        Picker("艦隊", selection: $selectedFleet) {
            ForEach(1...4, id: \.self) { fleet in
                Text("第\(fleet)").tag(fleet)
            }
        }
        .pickerStyle(.segmented)
    }

    @ViewBuilder
    private var fleetCard: some View {
        if let fleet = browser.snapshot?.fleets.first(where: { $0.id == selectedFleet }), !fleet.ships.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("第\(selectedFleet)艦隊")
                        .font(.headline)
                    if fleet.isSortie {
                        Text("出撃艦隊")
                            .font(.caption2.bold())
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(.blue.opacity(0.18), in: Capsule())
                    }
                }

                ScrollView(.horizontal, showsIndicators: true) {
                    VStack(spacing: 0) {
                        fleetHeader
                        ForEach(fleet.ships) { ship in
                            shipRow(ship)
                            Divider()
                        }
                    }
                    .frame(minWidth: 620, alignment: .leading)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
        } else {
            Text("第\(selectedFleet)艦隊のデータ待ち")
                .font(.callout)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private var fleetHeader: some View {
        HStack(spacing: 6) {
            Text("状態").frame(width: 52, alignment: .leading)
            Text("艦").frame(width: 180, alignment: .leading)
            Text("HP").frame(width: 72, alignment: .leading)
            Text("Cond").frame(width: 105, alignment: .leading)
            Text("燃").frame(width: 42, alignment: .trailing)
            Text("弾").frame(width: 42, alignment: .trailing)
            Text("搭載").frame(width: 110, alignment: .leading)
        }
        .font(.caption2.bold())
        .foregroundStyle(.secondary)
        .padding(.vertical, 4)
    }

    private func shipRow(_ ship: KCSShipRow) -> some View {
        HStack(spacing: 6) {
            Text(damageLabel(ship.damage))
                .foregroundStyle(damageColor(ship.damage))
                .font(.caption.bold())
                .frame(width: 52, alignment: .leading)

            Text("\(ship.name) Lv\(ship.lv.map(String.init) ?? "?")")
                .lineLimit(1)
                .frame(width: 180, alignment: .leading)

            Text(hpText(ship))
                .font(.caption.monospacedDigit())
                .frame(width: 72, alignment: .leading)

            Text(condText(ship.cond))
                .foregroundStyle(condColor(ship.cond))
                .font(.caption.bold())
                .frame(width: 105, alignment: .leading)

            Text(ship.fuel.map(String.init) ?? "?")
                .frame(width: 42, alignment: .trailing)
            Text(ship.ammo.map(String.init) ?? "?")
                .frame(width: 42, alignment: .trailing)
            Text(ship.onslot.isEmpty ? "-" : ship.onslot.map(String.init).joined(separator: "/"))
                .font(.caption.monospacedDigit())
                .frame(width: 110, alignment: .leading)
        }
        .font(.caption)
        .padding(.vertical, 7)
    }

    private var guardSettings: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("進撃ブロッカー", systemImage: "hand.raised.fill")
                    .font(.headline)
                Spacer()
                Button("確認") {
                    dismiss()
                    Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 250_000_000)
                        browser.previewGuard()
                    }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }

            sliderRow(title: "横", value: $browser.guardWidthFraction)
            sliderRow(title: "縦", value: $browser.guardHeightFraction)

            HStack {
                Text("位置 X")
                    .frame(width: 52, alignment: .leading)
                Slider(value: $browser.guardCenterX, in: 0...1)
                Text("\(Int(browser.guardCenterX * 100))%")
                    .font(.caption.monospacedDigit())
                    .frame(width: 42, alignment: .trailing)
            }

            HStack {
                Text("位置 Y")
                    .frame(width: 52, alignment: .leading)
                Slider(value: $browser.guardCenterY, in: 0...1)
                Text("\(Int(browser.guardCenterY * 100))%")
                    .font(.caption.monospacedDigit())
                    .frame(width: 42, alignment: .trailing)
            }

            HStack {
                Button("初期値に戻す") { browser.resetGuardSettings() }
                    .buttonStyle(.bordered)
                Spacer()
                if let rect = browser.gameRect {
                    Text("ゲーム \(Int(rect.width))×\(Int(rect.height))")
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                } else {
                    Text("ゲーム領域検出待ち")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            Text("大破またはHP判定不明の戦闘結果では、赤枠を約2.4秒以内に3回タップすると5秒だけ解除します。")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private func sliderRow(title: String, value: Binding<Double>) -> some View {
        HStack {
            Text(title)
                .frame(width: 52, alignment: .leading)
            Slider(value: value, in: 0.20...1.0)
            Text("\(Int(value.wrappedValue * 100))%")
                .font(.caption.monospacedDigit())
                .frame(width: 42, alignment: .trailing)
        }
    }

    private func hpText(_ ship: KCSShipRow) -> String {
        guard let now = ship.hpNow, let max = ship.hpMax else { return "?" }
        return "\(now)/\(max)\(ship.hpSource == "battle" ? "*" : "")"
    }

    private func damageLabel(_ value: String) -> String {
        switch value {
        case "danger": return "大破"
        case "warn": return "中破"
        case "minor": return "小破"
        case "ok": return "健在"
        default: return "不明"
        }
    }

    private func damageColor(_ value: String) -> Color {
        switch value {
        case "danger": return .red
        case "warn": return .orange
        case "minor": return .yellow
        case "ok": return .green
        default: return .secondary
        }
    }

    private func condText(_ cond: Int?) -> String {
        guard let cond else { return "? 不明" }
        if cond >= 50 { return "✨ \(cond) キラ" }
        if cond >= 40 { return "\(cond) 通常" }
        if cond >= 30 { return "\(cond) 軽疲労" }
        if cond >= 20 { return "🟠 \(cond)" }
        return "🔴 \(cond)"
    }

    private func condColor(_ cond: Int?) -> Color {
        guard let cond else { return .secondary }
        if cond >= 50 { return .yellow }
        if cond >= 40 { return .green }
        if cond >= 30 { return .yellow }
        if cond >= 20 { return .orange }
        return .red
    }
}
