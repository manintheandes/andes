import Capacitor
import CoreLocation
import Foundation
import HealthKit

private struct ExportPoint: Codable {
    let lat: Double
    let lng: Double
    let alt: Double
    let time: Double
    let hr: Double?
}

private struct ExportRequest: Codable {
    let type: String
    let startDate: String
    let endDate: String
    let distance: Double
    let calories: Double?
    let averageHeartRate: Double?
    let maxHeartRate: Double?
    let route: [ExportPoint]
}

private struct ExportResponse: Encodable {
    let exportedAt: String?
    let routeStored: Bool
    let queued: Bool
}

private struct RetryResponse: Encodable {
    let processed: Int
}

private struct AuthorizationResponse: Encodable {
    let available: Bool
    let readAuthorized: Bool
    let writeAuthorized: Bool
    let readScopes: [String]
    let missingReadScopes: [String]
    let writeScopes: [String]
    let missingWriteScopes: [String]
}

private final class ExportQueueStore {
    private let key = "alpaca.healthkit.pendingExports"
    private let legacyKey = "andes.healthkit.pendingExports"
    private let defaults = UserDefaults.standard
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    func load() -> [ExportRequest] {
        if let data = defaults.data(forKey: key) {
            return (try? decoder.decode([ExportRequest].self, from: data)) ?? []
        }
        guard let legacy = defaults.data(forKey: legacyKey) else {
            return []
        }
        let decoded = (try? decoder.decode([ExportRequest].self, from: legacy)) ?? []
        save(decoded)
        defaults.removeObject(forKey: legacyKey)
        return decoded
    }

    func save(_ requests: [ExportRequest]) {
        if requests.isEmpty {
            defaults.removeObject(forKey: key)
            return
        }

        if let data = try? encoder.encode(requests) {
            defaults.set(data, forKey: key)
        }
    }

    func append(_ request: ExportRequest) {
        var requests = load()
        requests.append(request)
        save(requests)
    }
}

private enum HealthExportError: LocalizedError {
    case unavailable
    case invalidDate(String)
    case missingWorkout

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "HealthKit is unavailable on this device."
        case let .invalidDate(value):
            return "Could not parse HealthKit date: \(value)"
        case .missingWorkout:
            return "HealthKit did not return a saved workout."
        }
    }
}

@objc(AndesHealthKitPlugin)
public class AndesHealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AndesHealthKitPlugin"
    public let jsName = "AndesHealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "retryPendingExports", returnType: CAPPluginReturnPromise),
    ]

    private let healthStore = HKHealthStore()
    private let queueStore = ExportQueueStore()
    private let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private let localFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return formatter
    }()

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve([
            "available": HKHealthStore.isHealthDataAvailable()
        ])
    }

    @objc func getAuthorizationStatus(_ call: CAPPluginCall) {
        authorizationStatus { response in
            DispatchQueue.main.async {
                call.resolve(with: response)
            }
        }
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(with: AuthorizationResponse(
                available: false,
                readAuthorized: false,
                writeAuthorized: false,
                readScopes: [],
                missingReadScopes: self.readChecks().map(\.0),
                writeScopes: [],
                missingWriteScopes: self.writeChecks().map(\.0)
            ))
            return
        }

        let read = Set(readChecks().map(\.1))
        let write = Set(writeChecks().compactMap { $0.1 as? HKSampleType })

        healthStore.requestAuthorization(toShare: write, read: read) { _, error in
            if let error {
                DispatchQueue.main.async {
                    call.reject(error.localizedDescription, nil, error)
                }
                return
            }

            self.authorizationStatus { response in
                DispatchQueue.main.async {
                    call.resolve(with: response)
                }
            }
        }
    }

    @objc func writeWorkout(_ call: CAPPluginCall) {
        do {
            let request = try call.decode(ExportRequest.self)
            export(request, queueOnFailure: true) { result in
                DispatchQueue.main.async {
                    switch result {
                    case let .success(response):
                        call.resolve(with: response)
                    case let .failure(error):
                        call.reject(error.localizedDescription, nil, error)
                    }
                }
            }
        } catch {
            call.reject(error.localizedDescription, nil, error)
        }
    }

    @objc func retryPendingExports(_ call: CAPPluginCall) {
        let requests = queueStore.load()
        guard !requests.isEmpty else {
            call.resolve(with: RetryResponse(processed: 0))
            return
        }

        retry(requests, processed: 0, remaining: []) { processed, remaining in
            self.queueStore.save(remaining)
            DispatchQueue.main.async {
                call.resolve(with: RetryResponse(processed: processed))
            }
        }
    }

    private func retry(_ requests: [ExportRequest], processed: Int, remaining: [ExportRequest], completion: @escaping (Int, [ExportRequest]) -> Void) {
        guard let request = requests.first else {
            completion(processed, remaining)
            return
        }

        export(request, queueOnFailure: false) { result in
            switch result {
            case .success:
                self.retry(Array(requests.dropFirst()), processed: processed + 1, remaining: remaining, completion: completion)
            case .failure:
                self.retry(Array(requests.dropFirst()), processed: processed, remaining: remaining + [request], completion: completion)
            }
        }
    }

    private func export(_ request: ExportRequest, queueOnFailure: Bool, completion: @escaping (Result<ExportResponse, Error>) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(.failure(HealthExportError.unavailable))
            return
        }

        do {
            let parsed = try parse(request)
            let configuration = workoutConfiguration(for: request.type)
            let builder = HKWorkoutBuilder(healthStore: healthStore, configuration: configuration, device: .local())

            builder.beginCollection(withStart: parsed.startDate) { _, beginError in
                if let beginError {
                    self.handleWorkoutFailure(request, error: beginError, queueOnFailure: queueOnFailure, completion: completion)
                    return
                }

                let samples = self.samples(for: request, parsed: parsed)
                self.add(samples: samples, to: builder, request: request, parsed: parsed, queueOnFailure: queueOnFailure, completion: completion)
            }
        } catch {
            completion(.failure(error))
        }
    }

    private func add(
        samples: [HKSample],
        to builder: HKWorkoutBuilder,
        request: ExportRequest,
        parsed: ParsedRequest,
        queueOnFailure: Bool,
        completion: @escaping (Result<ExportResponse, Error>) -> Void
    ) {
        let continueFinishing = {
            builder.endCollection(withEnd: parsed.endDate) { _, endError in
                if let endError {
                    self.handleWorkoutFailure(request, error: endError, queueOnFailure: queueOnFailure, completion: completion)
                    return
                }

                builder.finishWorkout { workout, finishError in
                    if let finishError {
                        self.handleWorkoutFailure(request, error: finishError, queueOnFailure: queueOnFailure, completion: completion)
                        return
                    }

                    guard let workout else {
                        self.handleWorkoutFailure(request, error: HealthExportError.missingWorkout, queueOnFailure: queueOnFailure, completion: completion)
                        return
                    }

                    self.storeRouteIfNeeded(request.route, workout: workout) { routeStored in
                        completion(.success(ExportResponse(
                            exportedAt: self.isoFormatter.string(from: parsed.endDate),
                            routeStored: routeStored,
                            queued: false
                        )))
                    }
                }
            }
        }

        guard !samples.isEmpty else {
            continueFinishing()
            return
        }

        builder.add(samples) { _, addError in
            if let addError {
                self.handleWorkoutFailure(request, error: addError, queueOnFailure: queueOnFailure, completion: completion)
                return
            }
            continueFinishing()
        }
    }

    private func handleWorkoutFailure(
        _ request: ExportRequest,
        error: Error,
        queueOnFailure: Bool,
        completion: @escaping (Result<ExportResponse, Error>) -> Void
    ) {
        guard queueOnFailure else {
            completion(.failure(error))
            return
        }

        queueStore.append(request)
        completion(.success(ExportResponse(exportedAt: nil, routeStored: false, queued: true)))
    }

    private func storeRouteIfNeeded(_ points: [ExportPoint], workout: HKWorkout, completion: @escaping (Bool) -> Void) {
        guard points.count > 1 else {
            completion(false)
            return
        }

        let locations = points.map { point in
            CLLocation(
                coordinate: CLLocationCoordinate2D(latitude: point.lat, longitude: point.lng),
                altitude: point.alt,
                horizontalAccuracy: 5,
                verticalAccuracy: point.alt == 0 ? -1 : 5,
                course: -1,
                speed: -1,
                timestamp: Date(timeIntervalSince1970: point.time / 1000)
            )
        }

        let routeBuilder = HKWorkoutRouteBuilder(healthStore: healthStore, device: .local())
        routeBuilder.insertRouteData(locations) { _, insertError in
            if insertError != nil {
                completion(false)
                return
            }

            routeBuilder.finishRoute(with: workout, metadata: nil) { _, routeError in
                completion(routeError == nil)
            }
        }
    }

    private func workoutConfiguration(for type: String) -> HKWorkoutConfiguration {
        let configuration = HKWorkoutConfiguration()

        switch type {
        case "Ride":
            configuration.activityType = .cycling
            configuration.locationType = .outdoor
        case "Walk":
            configuration.activityType = .walking
            configuration.locationType = .outdoor
        case "Hike":
            configuration.activityType = .hiking
            configuration.locationType = .outdoor
        case "Yoga":
            configuration.activityType = .yoga
            configuration.locationType = .indoor
        default:
            configuration.activityType = .running
            configuration.locationType = .outdoor
        }

        return configuration
    }

    private func samples(for request: ExportRequest, parsed: ParsedRequest) -> [HKSample] {
        var samples: [HKSample] = []

        if request.distance > 0, let distanceType = distanceType(for: request.type) {
            let quantity = HKQuantity(unit: .meter(), doubleValue: request.distance)
            let sample = HKQuantitySample(type: distanceType, quantity: quantity, start: parsed.startDate, end: parsed.endDate)
            samples.append(sample)
        }

        if let calories = request.calories, calories > 0, let energyType = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) {
            let quantity = HKQuantity(unit: .kilocalorie(), doubleValue: calories)
            let sample = HKQuantitySample(type: energyType, quantity: quantity, start: parsed.startDate, end: parsed.endDate)
            samples.append(sample)
        }

        if let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate) {
            let unit = HKUnit.count().unitDivided(by: .minute())
            let heartRatePoints = request.route.filter { ($0.hr ?? 0) > 0 }

            if !heartRatePoints.isEmpty {
                samples.append(contentsOf: heartRatePoints.map { point in
                    let date = Date(timeIntervalSince1970: point.time / 1000)
                    let quantity = HKQuantity(unit: unit, doubleValue: point.hr ?? 0)
                    return HKQuantitySample(type: heartRateType, quantity: quantity, start: date, end: date)
                })
            } else if let averageHeartRate = request.averageHeartRate, averageHeartRate > 0 {
                let quantity = HKQuantity(unit: unit, doubleValue: averageHeartRate)
                let sample = HKQuantitySample(type: heartRateType, quantity: quantity, start: parsed.startDate, end: parsed.endDate)
                samples.append(sample)
            }
        }

        return samples
    }

    private func distanceType(for type: String) -> HKQuantityType? {
        switch type {
        case "Ride":
            return HKObjectType.quantityType(forIdentifier: .distanceCycling)
        case "Yoga":
            return nil
        default:
            return HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)
        }
    }

    private func parse(_ request: ExportRequest) throws -> ParsedRequest {
        guard let startDate = parseDate(request.startDate) else {
            throw HealthExportError.invalidDate(request.startDate)
        }
        guard let endDate = parseDate(request.endDate) else {
            throw HealthExportError.invalidDate(request.endDate)
        }
        return ParsedRequest(startDate: startDate, endDate: endDate)
    }

    private func parseDate(_ value: String) -> Date? {
        if let date = isoFormatter.date(from: value) {
            return date
        }
        return localFormatter.date(from: value)
    }

    private func readChecks() -> [(String, HKObjectType)] {
        var checks: [(String, HKObjectType)] = [
            ("workouts", HKObjectType.workoutType())
        ]

        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            checks.append(("sleep", sleep))
        }
        if let heartRate = HKObjectType.quantityType(forIdentifier: .heartRate) {
            checks.append(("heartRate", heartRate))
        }
        if let restingHeartRate = HKObjectType.quantityType(forIdentifier: .restingHeartRate) {
            checks.append(("restingHeartRate", restingHeartRate))
        }
        if let heartRateVariability = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) {
            checks.append(("heartRateVariability", heartRateVariability))
        }

        return checks
    }

    private func writeChecks() -> [(String, HKObjectType)] {
        var checks: [(String, HKObjectType)] = [
            ("workouts", HKObjectType.workoutType())
        ]

        checks.append(("workoutRoute", HKSeriesType.workoutRoute()))
        if let runningDistance = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning) {
            checks.append(("distanceWalkingRunning", runningDistance))
        }
        if let cyclingDistance = HKObjectType.quantityType(forIdentifier: .distanceCycling) {
            checks.append(("distanceCycling", cyclingDistance))
        }
        if let activeEnergy = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) {
            checks.append(("activeEnergyBurned", activeEnergy))
        }
        if let heartRate = HKObjectType.quantityType(forIdentifier: .heartRate) {
            checks.append(("heartRate", heartRate))
        }

        return checks
    }

    private func authorizationStatus(completion: @escaping (AuthorizationResponse) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(AuthorizationResponse(
                available: false,
                readAuthorized: false,
                writeAuthorized: false,
                readScopes: [],
                missingReadScopes: readChecks().map(\.0),
                writeScopes: [],
                missingWriteScopes: writeChecks().map(\.0)
            ))
            return
        }

        let writeChecks = self.writeChecks()
        let readChecks = self.readChecks()

        var grantedWrite: [String] = []
        var missingWrite: [String] = []

        for check in writeChecks {
            switch healthStore.authorizationStatus(for: check.1) {
            case .sharingAuthorized:
                grantedWrite.append(check.0)
            case .sharingDenied, .notDetermined:
                missingWrite.append(check.0)
            @unknown default:
                missingWrite.append(check.0)
            }
        }

        let group = DispatchGroup()
        let lock = NSLock()
        var grantedRead: [String] = []
        var missingRead: [String] = []

        for check in readChecks {
            group.enter()
            healthStore.getRequestStatusForAuthorization(toShare: Set<HKSampleType>(), read: Set([check.1])) { status, error in
                defer { group.leave() }

                lock.lock()
                defer { lock.unlock() }

                if error != nil {
                    missingRead.append(check.0)
                    return
                }

                switch status {
                case .unnecessary:
                    grantedRead.append(check.0)
                case .shouldRequest, .unknown:
                    missingRead.append(check.0)
                @unknown default:
                    missingRead.append(check.0)
                }
            }
        }

        group.notify(queue: .main) {
            completion(AuthorizationResponse(
                available: true,
                readAuthorized: missingRead.isEmpty,
                writeAuthorized: missingWrite.isEmpty,
                readScopes: grantedRead.sorted(),
                missingReadScopes: missingRead.sorted(),
                writeScopes: grantedWrite.sorted(),
                missingWriteScopes: missingWrite.sorted()
            ))
        }
    }
}

private struct ParsedRequest {
    let startDate: Date
    let endDate: Date
}
