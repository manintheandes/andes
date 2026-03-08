import Capacitor

@objc(AndesViewController)
public class AndesViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        bridge?.registerPluginInstance(AndesHealthKitPlugin())
    }
}
