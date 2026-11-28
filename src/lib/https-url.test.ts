import { describe, expect, it } from "vitest"
import { httpsUrl, slackUrl } from "./https-url"

describe("links from the backend the browser follows", () => {
  it("keeps only absolute https links", () => {
    expect(httpsUrl("https://checkout.stripe.com/c/pay/cs_1")).toBe("https://checkout.stripe.com/c/pay/cs_1")
    expect(httpsUrl("javascript:alert(1)")).toBeNull()
    expect(httpsUrl("data:text/html,hi")).toBeNull()
    expect(httpsUrl("http://checkout.stripe.com/x")).toBeNull()
    expect(httpsUrl("/relative")).toBeNull()
    expect(httpsUrl(undefined)).toBeNull()
  })

  it("Slack links must be on slack.com", () => {
    expect(slackUrl("https://slack.com/oauth/v2/authorize?x=1")).toBe("https://slack.com/oauth/v2/authorize?x=1")
    expect(slackUrl("https://acme.slack.com/oauth")).toBe("https://acme.slack.com/oauth")
    expect(slackUrl("https://slack.com.evil.example/x")).toBeNull()
    expect(slackUrl("https://evilslack.com/x")).toBeNull()
  })
})
