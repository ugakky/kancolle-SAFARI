import SwiftUI

struct ExpeditionCenterView: View {
    @EnvironmentObject private var browser: BrowserModel
    @Environment(\.dismiss) private var dismiss

    @State private var selectedFleetId = 2
    @State private var selectedMissionId = 2

    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                Form {
                    currentExpeditionsSection(now: context.date)
                    readinessSection
                    notificationSection
                    dataStatusSection
                }
            }
            .navigationTitle("遠征センター")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("閉じる") { dismiss() }
                }
            }
            .onAppear(perform: normalizeSelections)
            .onChange(of: browser.expeditionSnapshot?.missions) { _ in
                normalizeSelections()
            }
        }
    }

    @ViewBuilder
    private func currentExpeditionsSection(now: Date) -> some View {
        Section("第2〜第4艦隊") {
            if let snapshot = browser.expeditionSnapshot {
                ForEach(snapshot.fleets.sorted(by: { $0.id < $1.id })) { fleet in
                    VStack(alignment: .leading, spacing: 5) {
                        HStack {
                            Text("第\(fleet.id)艦隊")
                                .font(.headline)
                            Spacer()
                            if fleet.isRunning {
                                Label("遠征中", systemImage: "paperplane.fill")
                                    .font(.caption.bold())
                                    .foregroundStyle(.blue)
                            } else {
                                Text("待機中")
                                    .font(.caption.bold())
                                    .foregroundStyle(.secondary)
                            }
                        }

                        if fleet.isRunning {
                            Text(fleet.missionName ?? "遠征 #\(fleet.missionId ?? 0)")
                                .font(.subheadline.bold())
                            if let completion = fleet.completionTimeMillis {
                                Text(remainingText(completionMillis: completion, now: now))
                                    .font(.title3.monospacedDigit().bold())
                                Text("帰投予定 \(completionDateText(completion))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            } else {
                                Text("帰投時刻取得待ち")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                        }

                        if !fleet.ships.isEmpty {
                            let unsupplied = fleet.ships.filter { !$0.isFullySupplied }.count
                            let heavy = fleet.ships.filter(\.isHeavyDamage).count
                            let kira = fleet.ships.filter { ($0.cond ?? 0) >= 50 }.count
                            HStack(spacing: 12) {
                                Text("\(fleet.ships.count)隻")
                                Text("✨ \(kira)/\(fleet.ships.count)")
                                if unsupplied > 0 { Text("補給△ \(unsupplied)").foregroundStyle(.orange) }
                                if heavy > 0 { Text("大破 \(heavy)").foregroundStyle(.red).bold() }
                            }
                            .font(.caption)
                        }
                    }
                    .padding(.vertical, 3)
                }
            } else {
                Text("遠征データ待ち。母港を一度表示すると取得します。")
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var readinessSection: some View {
        Section("遠征可否チェック") {
            Picker("艦隊", selection: $selectedFleetId) {
                Text("第2").tag(2)
                Text("第3").tag(3)
                Text("第4").tag(4)
            }
            .pickerStyle(.segmented)

            if let missions = browser.expeditionSnapshot?.missions, !missions.isEmpty {
                Picker("遠征", selection: $selectedMissionId) {
                    ForEach(missions) { mission in
                        Text("#\(mission.id) \(mission.name)").tag(mission.id)
                    }
                }
            } else {
                LabeledContent("遠征", value: "マスタデータ待ち")
            }

            if let fleet = selectedFleet {
                let check = ExpeditionRuleEngine.check(missionId: selectedMissionId, fleet: fleet)
                VStack(alignment: .leading, spacing: 7) {
                    if let canDispatch = check.canDispatch {
                        Label(
                            canDispatch ? "編成条件OK" : "条件不足",
                            systemImage: canDispatch ? "checkmark.circle.fill" : "xmark.circle.fill"
                        )
                        .font(.headline)
                        .foregroundStyle(canDispatch ? .green : .red)
                    } else {
                        Label("条件DB未登録", systemImage: "questionmark.circle")
                            .font(.headline)
                            .foregroundStyle(.orange)
                    }

                    ForEach(check.failures, id: \.self) { reason in
                        Text("• \(reason)")
                            .foregroundStyle(check.supported ? .red : .secondary)
                    }
                    ForEach(check.warnings, id: \.self) { warning in
                        Text("⚠︎ \(warning)")
                            .foregroundStyle(.orange)
                    }

                    Text("未補給・大破・キラ状態は成功条件とは分けて警告表示します。条件DB未登録の遠征は推測でOK判定しません。")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            } else {
                Text("艦隊情報待ち")
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var notificationSection: some View {
        Section("通知") {
            Toggle(
                "遠征の帰投通知",
                isOn: Binding(
                    get: { browser.expeditionNotificationsEnabled },
                    set: { browser.setExpeditionNotificationsEnabled($0) }
                )
            )
            Text("帰投時刻を受信した時点でiOSのローカル通知を予約します。アプリがバックグラウンドに移っても、予約済み通知は端末側で処理されます。")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var dataStatusSection: some View {
        Section("データ") {
            if let snapshot = browser.expeditionSnapshot {
                LabeledContent("遠征マスタ", value: "\(snapshot.missions.count)件")
                LabeledContent("更新", value: updateDateText(snapshot.updatedAtMillis))
            } else {
                Text("未取得")
                    .foregroundStyle(.secondary)
            }
            Text("v0.2初版の編成条件DBは遠征ID 1〜21に対応。以降は段階的に追加します。")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var selectedFleet: KCSExpeditionFleet? {
        browser.expeditionSnapshot?.fleets.first { $0.id == selectedFleetId }
    }

    private func normalizeSelections() {
        guard let missions = browser.expeditionSnapshot?.missions, !missions.isEmpty else { return }
        if !missions.contains(where: { $0.id == selectedMissionId }) {
            selectedMissionId = missions[0].id
        }
    }

    private func remainingText(completionMillis: Double, now: Date) -> String {
        let seconds = Int((completionMillis / 1000) - now.timeIntervalSince1970)
        if seconds <= 0 { return "帰投待ち" }
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        let secs = seconds % 60
        return String(format: "あと %02d:%02d:%02d", hours, minutes, secs)
    }

    private func completionDateText(_ millis: Double) -> String {
        Date(timeIntervalSince1970: millis / 1000)
            .formatted(date: .omitted, time: .shortened)
    }

    private func updateDateText(_ millis: Double) -> String {
        Date(timeIntervalSince1970: millis / 1000)
            .formatted(date: .omitted, time: .standard)
    }
}
