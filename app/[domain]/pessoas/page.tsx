import { type Metadata } from "next"
import { AppBskyActorDefs } from "@atproto/api"

import { agent } from "@/lib/atproto"
import { prisma } from "@/lib/db"
import { Profile } from "@/components/profile"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const revalidate = 3600

interface Props {
  params: { domain: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const domain = params.domain

  return {
    title: `The ${domain} Community`,
    description: `See all the members of the ${domain} community.`,
  }
}

const PAGE_SIZE = 100

export default async function CommunityPage({ params }: Props) {
  const domain = params.domain

  const [count, { profiles: initialProfiles, nextOffset }] = await Promise.all([
    prisma.user.count({
      where: { domain: { name: domain } },
    }),
    getUsers(domain),
  ])

  return (
    <main className="container grid items-center gap-6 pb-8 pt-6 md:py-10">
      <div className="flex max-w-[980px] flex-col items-start gap-4">
        <h1 className="text-3xl font-extrabold leading-tight tracking-tighter sm:text-3xl md:text-5xl lg:text-6xl">
          Comunidade <span className="underline underline-offset-8">{domain}</span>
        </h1>
        {/* <p className="max-w-[500px] text-lg text-muted-foreground sm:text-xl">
          Want to join the {members.length} members of the {domain}{" "}
          community? Get your own{" "}
          <Link href="/" className="underline">
            {domain} handle
          </Link>
          .
        </p> */}
        <Tabs defaultValue="domain" className="mt-8">
          <TabsList>
            <TabsTrigger value="domain">{domain}</TabsTrigger>
            <TabsTrigger value="all">todos</TabsTrigger>
          </TabsList>
          <TabsContent value="domain">
            <div className="mt-6 grid w-full grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
              {initialProfiles
                .filter((profile) => profile.handle.endsWith(domain))
                .map((profile) => (
                  <a
                    href={`https://bsky.app/profile/${profile.handle}`}
                    key={profile.did}
                  >
                    <Profile profile={profile} />
                  </a>
                ))}
            </div>
          </TabsContent>
          <TabsContent value="all">
            <div className="mt-6 grid w-full grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
              {initialProfiles.map((profile) => (
                <a
                  href={`https://bsky.app/profile/${profile.handle}`}
                  key={profile.did}
                >
                  <Profile profile={profile} />
                </a>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}

function ProfileListSection({
  profiles,
}: {
  profiles: AppBskyActorDefs.ProfileViewDetailed[]
}) {
  return profiles.map((profile) => (
    <a href={`https://bsky.app/profile/${profile.handle}`} key={profile.did}>
      <Profile profile={profile} />
    </a>
  ))
}

async function getUsers(domain: string, offset = 0) {
  const users = await prisma.user.findMany({
    where: { domain: { name: domain } },
    select: { did: true },
    take: PAGE_SIZE,
    skip: offset,
  })

  const nextOffset = users.length >= PAGE_SIZE ? offset + PAGE_SIZE : null

  if (users.length === 0) {
    return {
      profiles: [],
      nextOffset,
    }
  }

  // fetch profiles in chunks of 25
  const chunks = []
  for (let i = 0; i < PAGE_SIZE; i += 25) {
    const chunk = users.slice(i, i + 25).map(({ did }) => did)
    if (chunk.length > 0) {
      chunks.push(chunk)
    }
  }

  // jealous of postfix await :(
  const responses = await Promise.all(
    chunks.map((actors) => agent.getProfiles({ actors }))
  )
  const profiles = responses
    .flatMap((response) => response.data.profiles)
    .filter(
      (value, index, array) =>
        array.findIndex(({ did }) => did === value.did) === index &&
        value.handle.endsWith(domain)
    )

  return {
    profiles,
    nextOffset,
  }
}

async function loadMoreUsers(domain: string, offset = 0) {
  "use server"
  const { profiles, nextOffset } = await getUsers(domain, offset)

  return [
    <ProfileListSection profiles={profiles} key={offset} />,
    nextOffset,
  ] as const
}
