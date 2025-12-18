import Foundation
import simd

struct BoxSessionData: Codable {
    var position: SIMD3<Float>
    var scale: Float
    var measurement: Float
}

class BoxSessionStore {
    static let key = "RoomSnapAR_BoxSessionData"
    
    static func save(box: BoxSessionData) {
        if let data = try? JSONEncoder().encode(box) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
    
    static func load() -> BoxSessionData? {
        if let data = UserDefaults.standard.data(forKey: key),
           let box = try? JSONDecoder().decode(BoxSessionData.self, from: data) {
            return box
        }
        return nil
    }
    
    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
