"""Concept Space Traversal plugin.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from bson import json_util
import json
from scipy import linalg
import fiftyone as fo
import fiftyone.core.storage as fos


import fiftyone.operators as foo
import fiftyone.operators.types as types


def get_valid_indexes(dataset):
    valid_indexes = []
    for br in dataset.list_brain_runs():
        bri = dataset.get_brain_info(br).config
        if (
            ("Similarity" in bri.cls)
            and bri.supports_prompts
            and bri.metric == "cosine"
        ):
            valid_indexes.append(br)
    return valid_indexes


def _normalize(embedding):
    return embedding / linalg.norm(embedding)


def generate_destination_vector(index, sample_id, concepts, text_scale):
    sample_embedding = index.get_embeddings([sample_id])[0][0]

    model = index.get_model()

    concept_embedding = sum(
        model.embed_prompts([concept["concept"]])[0] * concept["strength"]
        for concept in concepts
    )

    dest_vec = _normalize(
        sample_embedding + text_scale * _normalize(concept_embedding)
    )
    return dest_vec


def run_traversal(ctx):
    dataset = ctx.dataset
    index_name = ctx.params.get("index")
    index = dataset.load_brain_results(index_name)

    concepts = ctx.params.get("concepts")
    text_scale = ctx.params.get("text_scale")
    sample_id = ctx.params.get("sample")

    dest_vec = generate_destination_vector(
        index, sample_id, concepts, text_scale
    )

    view = dataset.sort_by_similarity(dest_vec, brain_key=index.key, k=25)
    return view


def serialize_view(view):
    return json.loads(json_util.dumps(view._serialize()))


class OpenTraversalPanel(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="open_traversal_panel",
            label="Concept Traversal: open traversal panel",
            icon="/assets/mesh_dark.svg",
        )

    def resolve_placement(self, ctx):
        return types.Placement(
            types.Places.SAMPLES_GRID_SECONDARY_ACTIONS,
            types.Button(
                label="Open Traversal Panel",
                icon_dark="/assets/mesh_dark.svg",
                icon_light="/assets/mesh_light.svg",
                icon="/assets/mesh_dark.svg",
                prompt=False,
            ),
        )

    def execute(self, ctx):
        ctx.trigger(
            "open_panel",
            params=dict(
                name="TraversalPanel", isActive=True, layout="horizontal"
            ),
        )


class RunTraversal(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="traverser",
            label="Traverse",
            unlisted=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        inputs.str("sample", label="Sample ID", required=True)
        inputs.str("index", label="Brain Key", required=True)
        inputs.float("text_scale", label="Text Scale", required=True)

        list_row = types.Object()
        list_row_cell = types.View(space=8)
        list_row.str("concept", label="Concept", view=list_row_cell)
        inputs.list("concepts", list_row, label="Concepts")
        return types.Property(inputs)

    def execute(self, ctx):
        view = run_traversal(ctx)
        ctx.trigger(
            "set_view",
            params=dict(view=serialize_view(view)),
        )


class GetSampleURL(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="get_sample_url",
            label="Concept Traversal: Get sample URL",
            unlisted=True,
        )

    def execute(self, ctx):
        try:
            sample_id = ctx.params.get("id", None)
            sample = ctx.dataset[sample_id]
            sample_filepath = sample.filepath
            try:
                # pylint: disable=no-member
                sample_filepath = fos.get_url(sample_filepath)
            except:
                address = fo.config.default_app_address
                port = fo.config.default_app_port
                sample_filepath = (
                    f"http://{address}:{port}/media?filepath={sample_filepath}"
                )
            return {"url": sample_filepath}
        except:
            return {}


def register(p):
    p.register(RunTraversal)
    p.register(OpenTraversalPanel)
    p.register(GetSampleURL)
