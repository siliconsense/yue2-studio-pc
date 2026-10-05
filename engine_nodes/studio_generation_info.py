"""Output-only observer: reads YuE2 metadata without changing audio or sampling."""
import json


class SiliconSenseYuE2GenerationInfo:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'conditioning': ('CONDITIONING',),
                             'requested_seconds': ('FLOAT', {'default': 120, 'min': 0.04, 'max': 900})}}

    RETURN_TYPES = ()
    FUNCTION = 'report'
    OUTPUT_NODE = True
    CATEGORY = 'SiliconSense'

    def report(self, conditioning, requested_seconds):
        metadata = conditioning[0][1]
        frames = int(metadata['yue2_frames'])
        truncated = bool(metadata.get('yue2_truncated', False))
        warning = None
        if truncated:
            warning = 'duration_limit' if frames >= round(requested_seconds * 25) else 'context_limit'
        return {'ui': {'text': [json.dumps({'seconds': frames / 25,
                    'requested_seconds': requested_seconds,
                    'truncated': truncated, 'warning_code': warning})]}}


NODE_CLASS_MAPPINGS = {'SiliconSenseYuE2GenerationInfo': SiliconSenseYuE2GenerationInfo}
