import Image from "next/image";

export default function SoundFamiliar() {
  const cards = [
    {
      title: "Plants not thriving",
      image: "/images/sound-familiar/plants not thriving_final.PNG",
    },
    {
      title: "Not sure what works here",
      image: "/images/sound-familiar/Not sure what works_final.PNG",
    },
    {
      title: "Care feels inconsistent",
      image: "/images/sound-familiar/Care feels inconsistent_final.PNG",
    },
    {
      title: "No time to manage",
      image: "/images/sound-familiar/not time to manage final.PNG",
    },
  ];

  return (
    <section className="bg-white py-12">
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        <div className="mb-6">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-2">
            Sound familiar?
          </h2>
          <p className="text-lg text-gray-600">
            A few signs your balcony needs better care.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 md:gap-6">
          {cards.map((card, idx) => (
            <div
              key={idx}
              className="overflow-hidden rounded-2xl bg-white shadow-sm"
            >
              <div className="relative aspect-[4/3] w-full bg-gray-100">
                <Image
                  src={card.image}
                  alt={card.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 50vw"
                  unoptimized
                />
              </div>
              <div className="px-3 py-2 md:px-4 md:py-3 bg-gray-200">
                <h3 className="text-sm font-semibold leading-snug text-gray-900 md:text-base">
                  {card.title}
                </h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
