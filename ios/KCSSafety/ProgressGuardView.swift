import SwiftUI

struct ProgressGuardLayer: View {
    @EnvironmentObject private var browser: BrowserModel
    let containerSize: CGSize

    var body: some View {
        if browser.shouldShowGuard,
           let frame = guardFrame() {
            ZStack {
                RoundedRectangle(cornerRadius: 16)
                    .fill(browser.guardPreview ? Color.red.opacity(0.62) : Color.red.opacity(0.86))
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.pink.opacity(0.95), lineWidth: 4)

                VStack(spacing: 5) {
                    if browser.guardPreview {
                        Text("🚧 サイズ確認")
                            .font(.headline.bold())
                        Text("5:3ゲーム領域内")
                            .font(.caption.bold())
                    } else {
                        Text((browser.snapshot?.heavyCount ?? 0) > 0 ? "🚨 大破艦あり" : "⚠️ HP判定不明")
                            .font(.headline.bold())
                        Text("進撃系操作をロック中")
                            .font(.caption.bold())
                        Text("進撃するなら赤枠を3連続タップ")
                            .font(.caption2)
                        Text("\(min(3, browser.guardTapCount)) / 3")
                            .font(.title3.monospacedDigit().bold())
                    }
                }
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
                .padding(8)
            }
            .frame(width: frame.width, height: frame.height)
            .position(x: frame.midX, y: frame.midY)
            .contentShape(Rectangle())
            .onTapGesture {
                guard !browser.guardPreview else { return }
                browser.guardTap()
            }
            .zIndex(999)
            .accessibilityLabel(browser.guardPreview ? "進撃ブロッカーサイズ確認" : "大破進撃ブロッカー")
        }
    }

    private func guardFrame() -> CGRect? {
        guard let rect = browser.gameRect else { return nil }

        let gameX = min(max(CGFloat(rect.x), 0), containerSize.width)
        let gameY = min(max(CGFloat(rect.y), 0), containerSize.height)
        let availableWidth = max(0, containerSize.width - gameX)
        let availableHeight = max(0, containerSize.height - gameY)
        let gameWidth = min(CGFloat(rect.width), availableWidth)
        let gameHeight = min(CGFloat(rect.height), availableHeight)

        guard gameWidth >= 120, gameHeight >= 72 else { return nil }

        let widthFraction = CGFloat(browser.guardWidthFraction)
        let heightFraction = CGFloat(browser.guardHeightFraction)
        let centerX = CGFloat(browser.guardCenterX)
        let centerY = CGFloat(browser.guardCenterY)

        let width = min(gameWidth, max(96, gameWidth * widthFraction))
        let height = min(gameHeight, max(72, gameHeight * heightFraction))

        var left = gameX + gameWidth * centerX - width / 2
        var top = gameY + gameHeight * centerY - height / 2

        left = min(max(left, gameX), gameX + gameWidth - width)
        top = min(max(top, gameY), gameY + gameHeight - height)

        return CGRect(x: left, y: top, width: width, height: height)
    }
}
