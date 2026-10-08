import ExpoModulesCore
import UIKit
import Vision

#if canImport(FoundationModels)
import FoundationModels

@available(iOS 26.0, *)
@Generable
private struct AppleIntelligenceTurn {
  @Guide(
    description: "The next step. Use tool when app data must be read or changed; otherwise use final.",
    .anyOf(["tool", "final"])
  )
  var type: String

  @Guide(
    description: "For a tool step, the exact available tool name. For a final step, an empty string.",
    .anyOf([
      "", "addFridgeItem", "addShoppingItem", "massAddShoppingItems",
      "removeFridgeItem", "removeShoppingItem", "findInFridge",
      "findInShoppingList",
      "getFridgeContents", "getShoppingListContents", "streamlineLists",
      "proposeAddAllToFridge", "updateFridgeItem", "proposeBulkFridgeUpdate",
      "recommendRecipes",
      "proposeRecipePreferenceUpdate",
    ])
  )
  var name: String

  @Guide(description: "For a tool step, a valid JSON object containing the tool arguments. For a final step, use {}.")
  var arguments: String

  @Guide(description: "For a final step, the conversational answer to the user. For a tool step, an empty string.")
  var text: String
}

/// Private Cloud Compute is preferred over the on-device model whenever it is
/// usable: it has a far larger context window and stronger reasoning. The
/// on-device model stays the fallback for older systems, devices that cannot
/// run PCC, and days where the PCC quota is spent.
@available(iOS 26.0, *)
private enum AppleIntelligenceEngine: String {
  case privateCloudCompute = "private_cloud_compute"
  case onDevice = "on_device"
  case unavailable = "unavailable"
}

@available(iOS 26.0, *)
private struct PrivateCloudComputeState {
  let supported: Bool
  let ready: Bool
  let status: String
  let reason: String
  let quotaLimited: Bool
  let quotaResetDate: String?
}

@available(iOS 26.0, *)
private struct OnDeviceModelState {
  let available: Bool
  let status: String
  let reason: String
}

@available(iOS 26.0, *)
private func onDeviceModelState() -> OnDeviceModelState {
  switch SystemLanguageModel.default.availability {
  case .available:
    return OnDeviceModelState(
      available: true,
      status: "available",
      reason: "Apple Intelligence is ready on this device."
    )
  case .unavailable(.deviceNotEligible):
    return OnDeviceModelState(
      available: false,
      status: "device_not_eligible",
      reason: "This device does not support Apple Intelligence."
    )
  case .unavailable(.appleIntelligenceNotEnabled):
    return OnDeviceModelState(
      available: false,
      status: "not_enabled",
      reason: "Apple Intelligence is supported but turned off in Settings."
    )
  case .unavailable(.modelNotReady):
    return OnDeviceModelState(
      available: false,
      status: "model_not_ready",
      reason: "The Apple Intelligence model is still downloading or is temporarily not ready."
    )
  case .unavailable:
    return OnDeviceModelState(
      available: false,
      status: "unavailable",
      reason: "Apple Intelligence is unavailable for a system reason that iOS did not identify."
    )
  }
}

/// `PrivateCloudComputeLanguageModel` is iOS 27 and later, so older systems
/// report `unsupported_os` and keep using the on-device model.
@available(iOS 26.0, *)
private func privateCloudComputeState() -> PrivateCloudComputeState {
  guard #available(iOS 27.0, *) else {
    return PrivateCloudComputeState(
      supported: false,
      ready: false,
      status: "unsupported_os",
      reason: "Private Cloud Compute requires iOS 27 or later.",
      quotaLimited: false,
      quotaResetDate: nil
    )
  }

  let model = PrivateCloudComputeLanguageModel()
  let quota = model.quotaUsage
  let quotaLimited = quota.isLimitReached
  let quotaResetDate = quota.resetDate.map {
    ISO8601DateFormatter().string(from: $0)
  }

  // Availability and quota are independent: the model can be available with
  // its daily request budget already spent.
  switch model.availability {
  case .available where quotaLimited:
    return PrivateCloudComputeState(
      supported: true,
      ready: false,
      status: "quota_limited",
      reason: "The Private Cloud Compute daily limit has been reached.",
      quotaLimited: true,
      quotaResetDate: quotaResetDate
    )
  case .available:
    return PrivateCloudComputeState(
      supported: true,
      ready: true,
      status: "available",
      reason: "Private Cloud Compute is ready.",
      quotaLimited: false,
      quotaResetDate: quotaResetDate
    )
  case .unavailable(.deviceNotEligible):
    return PrivateCloudComputeState(
      supported: true,
      ready: false,
      status: "device_not_eligible",
      reason: "This device does not support Private Cloud Compute.",
      quotaLimited: quotaLimited,
      quotaResetDate: quotaResetDate
    )
  case .unavailable(.systemNotReady):
    return PrivateCloudComputeState(
      supported: true,
      ready: false,
      status: "system_not_ready",
      reason: "Private Cloud Compute is not ready right now.",
      quotaLimited: quotaLimited,
      quotaResetDate: quotaResetDate
    )
  case .unavailable:
    return PrivateCloudComputeState(
      supported: true,
      ready: false,
      status: "unavailable",
      reason: "Private Cloud Compute is unavailable for a system reason that iOS did not identify.",
      quotaLimited: quotaLimited,
      quotaResetDate: quotaResetDate
    )
  }
}

/// Returns the session the Apple provider should use: Private Cloud Compute
/// when the entitlement, OS, and daily quota allow it, otherwise the on-device
/// model. Both models take the same instructions and respond API, so callers
/// do not change.
@available(iOS 26.0, *)
private func makeLanguageModelSession(
  instructions: String
) throws -> LanguageModelSession {
  if #available(iOS 27.0, *) {
    let model = PrivateCloudComputeLanguageModel()
    if case .available = model.availability, !model.quotaUsage.isLimitReached {
      return LanguageModelSession(model: model, instructions: instructions)
    }
  }

  guard SystemLanguageModel.default.isAvailable else {
    throw AppleIntelligenceException(
      "Apple Intelligence is not available right now."
    )
  }
  return LanguageModelSession(
    model: SystemLanguageModel.default,
    instructions: instructions
  )
}

/// Explains an on-device answer without hiding that PCC was preferred.
@available(iOS 26.0, *)
private func onDeviceFallbackReason(
  privateCloud: PrivateCloudComputeState,
  onDevice: OnDeviceModelState
) -> String {
  if privateCloud.quotaLimited {
    return "The Private Cloud Compute daily limit has been reached, so Apple Intelligence is using the on-device model."
  }
  if privateCloud.supported {
    return "Private Cloud Compute is not ready right now, so Apple Intelligence is using the on-device model."
  }
  return onDevice.reason
}

private func bridgeValue(_ value: String?) -> Any {
  value ?? NSNull()
}
#endif

public final class AppleIntelligenceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppleIntelligence")

    AsyncFunction("getAvailability") { () -> [String: Any] in
      return Self.availability()
    }

    AsyncFunction("openSettings") { () async -> Bool in
      guard let url = URL(string: UIApplication.openSettingsURLString) else {
        return false
      }
      return await UIApplication.shared.open(url)
    }

    AsyncFunction("generate") { (instructions: String, prompt: String) async throws -> String in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        let session = try makeLanguageModelSession(instructions: instructions)
        let response = try await session.respond(to: prompt)
        return response.content
      }
      #endif
      throw AppleIntelligenceException("Apple Intelligence requires iOS 26 or later.")
    }

    AsyncFunction("generateToolTurn") { (instructions: String, prompt: String) async throws -> [String: String] in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        let session = try makeLanguageModelSession(instructions: instructions)
        let response = try await session.respond(
          to: prompt,
          generating: AppleIntelligenceTurn.self
        )
        return [
          "type": response.content.type,
          "name": response.content.name,
          "arguments": response.content.arguments,
          "text": response.content.text,
        ]
      }
      #endif
      throw AppleIntelligenceException("Apple Intelligence requires iOS 26 or later.")
    }

    AsyncFunction("generateToolTurnWithImages") { (instructions: String, prompt: String, imageBase64: [String]) async throws -> [String: String] in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        var recognizedText = ""
        for base64 in imageBase64.prefix(4) {
          if let text = try? Self.recognizedText(from: base64), !text.isEmpty {
            recognizedText += "\n\n\(text)"
          }
        }

        let trimmedPrompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        let effectivePrompt: String
        if !recognizedText.isEmpty {
          effectivePrompt = "\(prompt)\n\nRecognized text from the attached image(s):\(recognizedText)"
        } else if trimmedPrompt.isEmpty {
          effectivePrompt = "The attached image contained no readable text."
        } else {
          effectivePrompt = prompt
        }

        let session = try makeLanguageModelSession(instructions: instructions)
        let response = try await session.respond(
          to: effectivePrompt,
          generating: AppleIntelligenceTurn.self
        )
        return [
          "type": response.content.type,
          "name": response.content.name,
          "arguments": response.content.arguments,
          "text": response.content.text,
        ]
      }
      #endif
      throw AppleIntelligenceException("Apple Intelligence requires iOS 26 or later.")
    }
  }

  private static func availability() -> [String: Any] {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      let privateCloud = privateCloudComputeState()
      let onDevice = onDeviceModelState()
      let privateCloudPayload: [String: Any] = [
        "supported": privateCloud.supported,
        "ready": privateCloud.ready,
        "status": privateCloud.status,
        "reason": privateCloud.reason,
        "quotaLimited": privateCloud.quotaLimited,
        "quotaResetDate": bridgeValue(privateCloud.quotaResetDate),
      ]

      // `status` keeps describing whether the Apple provider can answer at all,
      // which is what the provider picker gates on; `engine` says which model
      // answers and `privateCloudCompute` carries the PCC detail.
      var payload: [String: Any] = [
        "engine": AppleIntelligenceEngine.unavailable.rawValue,
        "onDeviceAvailable": onDevice.available,
        "privateCloudCompute": privateCloudPayload,
      ]

      if privateCloud.ready {
        payload["status"] = "available"
        payload["available"] = true
        payload["reason"] = privateCloud.reason
        payload["engine"] = AppleIntelligenceEngine.privateCloudCompute.rawValue
        return payload
      }

      if onDevice.available {
        payload["status"] = "available"
        payload["available"] = true
        payload["reason"] = onDeviceFallbackReason(
          privateCloud: privateCloud,
          onDevice: onDevice
        )
        payload["engine"] = AppleIntelligenceEngine.onDevice.rawValue
        return payload
      }

      payload["status"] = onDevice.status
      payload["available"] = false
      payload["reason"] = onDevice.reason
      return payload
    }
    #endif
    return result("unsupported_os", false, "Apple Intelligence in apps requires iOS 26 or later.")
  }

  private static func result(_ status: String, _ available: Bool, _ reason: String) -> [String: Any] {
    ["status": status, "available": available, "reason": reason]
  }

  private static func recognizedText(from base64: String) throws -> String {
    guard
      let data = Data(base64Encoded: base64),
      let image = UIImage(data: data),
      let cgImage = image.cgImage
    else {
      return ""
    }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])

    return (request.results ?? [])
      .compactMap { $0.topCandidates(1).first?.string }
      .joined(separator: "\n")
  }
}

private struct AppleIntelligenceException: LocalizedError {
  let message: String

  init(_ message: String) {
    self.message = message
  }

  var errorDescription: String? { message }
}
